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
    }
  }
}

export {};
