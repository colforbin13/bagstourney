# Stripe setup

Everything a human has to do in the Stripe dashboard to turn billing on, plus how to test
it locally before it touches real money. The code is already written and deployed-safe: with
no keys configured, billing is simply off — the paid flags stay super-admin-only, the
upgrade buttons don't render, and the app behaves exactly as it did before.

This covers the **organizer pays the platform** integration (FEATURE_TRACKER items 12 and
13): a recurring subscription on an organizer account, and a one-time unlock for a single
tournament. It is a single-merchant integration. Participant registration fees (items 10/11)
are a separate Stripe Connect build and are not part of this.

Config values live in `api/config/database.php`, which is not in git. Every value below has a
placeholder there and a matching `BB_*` environment variable.

**This install uses Stripe Managed Payments** (chosen 2026-09-08). Stripe is the merchant of
record: it calculates, collects and remits sales tax / VAT / GST, absorbs fraud and dispute
liability, and answers transaction-level buyer support — for 3.5% on top of standard
processing, so roughly 6.4% + $0.30 on a US card rather than 2.9% + $0.30.

The reasoning, so it isn't re-argued: at validation volume the surcharge is a few dollars a
month, while the compliance work it removes is unbounded and the kind that fails silently for
years before it gets expensive. Notably, **existing subscriptions cannot be migrated to
Managed Payments later** — only new ones bought through a Managed Payments Checkout Session
are eligible — so adopting it before the first subscriber is meaningfully easier than after.

`BB_STRIPE_MANAGED_PAYMENTS` controls it and defaults to **true**. Turning it off doesn't
break checkout; it silently makes *us* the merchant of record and hands us the tax liability,
which is why the default is the safe direction rather than the conservative-looking one.

---

## 0. Enable Managed Payments

Before anything else, at **Settings → Managed Payments**:

1. Accept the [Managed Payments terms of service](https://stripe.com/legal/managed-payments).
   Nothing works until this is accepted, and it is not something an agent can do for you.
2. Enable the feature.
3. Confirm your account's API version is **`2025-03-31.basil` or later**. Older versions
   don't know the `managed_payments` parameter and every checkout would fail at creation. If
   yours is older, pin a newer one in `BB_STRIPE_API_VERSION` rather than migrating the whole
   account.

Also check that a tournament-management SaaS product maps to an
[eligible tax code](https://docs.stripe.com/payments/managed-payments/eligibility#eligible-tax-codes).
SaaS is explicitly supported, but eligibility is per-tax-code and worth confirming before you
build the catalogue around it.

## 1. Create the products and prices

In **Product catalogue → Add product**. Create two products; the prices are what the config
actually references.

| Product | Price type | Config value |
|---|---|---|
| Bracketway Pro (subscription) | Recurring, monthly | `BB_STRIPE_PRICE_SUBSCRIPTION_MONTHLY` |
| Bracketway Pro (subscription) | Recurring, yearly — optional second price on the same product | `BB_STRIPE_PRICE_SUBSCRIPTION_ANNUAL` |
| Tournament upgrade | One-off | `BB_STRIPE_PRICE_TOURNAMENT_UNLOCK` |

Copy each **price id** (`price_...`), not the product id.

**Set a product tax code on both products** — Managed Payments cannot calculate tax without
one, and a product missing it will fail at checkout rather than fall back to something. In
the Dashboard: Product catalogue → ⋯ → Edit product → **Product tax code**, choosing one
labelled `Eligible for Managed Payments`. Or by API:

```
stripe products update prod_XXXX --tax-code txcd_XXXXXXXX
```

Prices default to tax-**exclusive**, meaning tax is added on top of the number you set. If
you'd rather the price an organizer sees be the total they pay, set the price's tax behaviour
to inclusive, or flip **Include tax in prices** in Tax settings. Decide this before you
publish a price — changing it later means new price objects.

The amounts live in Stripe, deliberately — nothing in this repo stores what you charge, so
changing a price is a dashboard edit with no deploy and no risk of the displayed price
disagreeing with the amount actually charged. The upgrade screen reads them live from
`GET /billing/plans`.

Leaving any of the three blank simply means that option isn't sold. A monthly-only plan, or
a per-tournament unlock with no subscription at all, are both supported configurations.

## 2. API key

**Developers → API keys →** copy the secret key into `BB_STRIPE_SECRET_KEY`.

Start with the **test** key (`sk_test_...`). Nothing in the code distinguishes test from live
except that prefix, and `GET /billing/status` reports which mode is active so the billing
screen can say so out loud — worth having, because "why didn't my real card get charged" is
otherwise a confusing half hour.

There is no publishable key to set. Checkout is a server-side redirect, so no Stripe key
ever reaches the browser.

## 3. Webhook endpoint

**Developers → Webhooks → Add endpoint.**

**URL:**

```
https://bracketway.com/api/billing/webhook
```

Note `/api`, **not** `/bags/api`. Despite the `/bags` deploy path, production serves the API
at the domain root; `/bags/api/...` returns the Angular app's `index.html`. A webhook
registered there would answer 200 with HTML forever and never grant anything — see the
deployment note in `CLAUDE.md`.

**Events to subscribe to** — exactly these ten. Anything else is ignored safely, but these
are the ones that are actually acted on:

```
checkout.session.completed
checkout.session.expired
checkout.session.async_payment_succeeded
checkout.session.async_payment_failed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
charge.refunded
charge.dispute.created
invoice.payment_failed
```

Then copy the endpoint's **signing secret** (`whsec_...`) into `BB_STRIPE_WEBHOOK_SECRET`.

This one is not optional. A secret key with no webhook secret is the one genuinely dangerous
half-configuration — organizers could be charged and never receive the plan, because
fulfilment happens on the webhook — so the API refuses to sell anything until both are set,
and logs a warning at startup if it sees the secret key alone.

## 4. Billing portal

**Settings → Billing → Customer portal →** turn it on, and allow customers to cancel
subscriptions and update payment methods.

Cancellation lives there rather than in our UI, so there is no second implementation of it to
drift out of step with what Stripe actually did.

## 5. Apply the migration

```
php db/migrate.php
```

Adds `017_stripe_billing.sql`. Per `CLAUDE.md`'s ordering rule: deploy the API files first,
run the migration on the target, then deploy the frontend.

---

## Testing locally

The webhook is the half that cannot be tested by clicking around, because Stripe has to be
able to reach you. Use the Stripe CLI:

```
stripe login
stripe listen --forward-to localhost:8080/billing/webhook
```

`stripe listen` prints its own `whsec_...` — use **that** as `BB_STRIPE_WEBHOOK_SECRET` while
testing locally. It is different from the dashboard endpoint's secret.

Then drive a real checkout through the UI with test card `4242 4242 4242 4242`, any future
expiry, any CVC. Useful cards for the paths that are otherwise hard to reach:

| Card | What it exercises |
|---|---|
| `4242 4242 4242 4242` | Normal success |
| `4000 0000 0000 9995` | Declined for insufficient funds |
| `4000 0000 0000 3220` | 3D Secure challenge |

You can also fire individual events without paying:

```
stripe trigger checkout.session.completed
stripe trigger customer.subscription.deleted
```

Note that a triggered event carries a Stripe-generated session id with no matching
`billing_checkouts` row, so it will be recorded and then deliberately grant nothing — that is
the guard working, not a failure. Check `billing_events.detail` to see it say so. To test
fulfilment end to end, go through a real test-mode checkout instead.

## What to check after the first live payment

```sql
SELECT * FROM billing_checkouts ORDER BY id DESC LIMIT 5;
SELECT * FROM billing_events ORDER BY received_at DESC LIMIT 10;
```

- `billing_checkouts.status` should be `paid` with a `fulfilled_at`.
- `billing_events.status` should be `processed`. A row sitting in `error` means the handler
  threw; `detail` says why, and Stripe will keep retrying it for three days, so fixing the
  cause is usually enough for it to heal itself.
- `ignored` is a normal outcome, not a problem — it is how an event we understood but had
  nothing to do about is recorded.

---

## Before going live

The code is done; these are the things only you can do.

- **A Stripe account that can accept live payments** — business details, bank account, and
  identity verification. Stripe will not issue live keys until this is complete.
- **Accept the Managed Payments terms** (step 0) in live mode as well as test.
- **Terms of service and a refund policy**, reachable from the site. Stripe requires them,
  and the refund policy is worth deciding deliberately rather than at the moment someone
  first asks: the code will revoke a tournament unlock automatically on a *full* refund, and
  deliberately leaves access in place on a partial one for a human to judge.
- **Sales tax / VAT — handled by Stripe**, in more than 80 countries, as part of Managed
  Payments. This is the main thing you bought. You are not registering or remitting anywhere,
  and there is nothing in this repo that calculates tax.
- **Disputes — handled by Stripe**, including the response. Our `charge.dispute.created`
  handler still revokes the tournament unlock the disputed payment bought, which is a local
  entitlement decision, not a dispute response.
- **Receipts and invoices — sent by Stripe.** This is why `invoice_creation` is stripped from
  the session (see `BillingController::applyManagedPayments()`); Stripe issues a better
  receipt than the one we were generating.
- **Swap the test keys for live keys**, and register a second webhook endpoint — live mode
  has its own endpoints and its own signing secret. This is the step most easily forgotten:
  test-mode webhooks do not fire for live payments.
- **Decide the prices.** Nothing in the code assumes any particular number. Remember the
  effective fee is roughly 6.4% + $0.30 rather than 2.9% + $0.30, which matters most on the
  cheapest thing you sell — on a $5 unlock that is over 12% once the fixed fee is counted.
