import type { UserDoc, CoupleDoc, Id } from './models';

declare global {
  namespace Express {
    interface Request {
      user: UserDoc;
      couple: CoupleDoc;
      /** The other member of the couple, when they have joined. */
      partnerId?: Id;
    }
  }
}
export {};
