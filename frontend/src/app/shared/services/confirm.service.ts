import { BehaviorSubject } from 'rxjs';

type Pending = { message: string; resolve: (v: boolean) => void } | null;

export class ConfirmService {
  private subj = new BehaviorSubject<Pending>(null);

  confirm(message: string): Promise<boolean> {
    return new Promise(resolve => {
      this.subj.next({ message, resolve });
    });
  }

  get observable() {
    return this.subj.asObservable();
  }

  clear() {
    this.subj.next(null);
  }
}

export const confirmService = new ConfirmService();
