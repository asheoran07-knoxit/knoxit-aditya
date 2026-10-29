declare global {
  namespace Express {
    interface Request {
      userId?: string;
      authUser?: {
        id: string;
        email: string;
        username: string;
        isOperationsAdmin: boolean;
      };
      /** Chip balance read with the session lookup, at the start of this request. */
      chipBalanceAtAuth?: number;
    }
  }
}

export {};
