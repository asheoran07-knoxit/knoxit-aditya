import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export type AuthUser = {
  id: string;
  email: string;
  username: string;
  isOperationsAdmin: boolean;
};

type AuthState = {
  user: AuthUser | null;
  status: "loading" | "authenticated" | "guest";
};

const initialState: AuthState = {
  user: null,
  status: "loading"
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    sessionLoaded(state, action: PayloadAction<AuthUser | null>) {
      state.user = action.payload;
      state.status = action.payload ? "authenticated" : "guest";
    },
    signedOut(state) {
      state.user = null;
      state.status = "guest";
    }
  }
});

export const { sessionLoaded, signedOut } = authSlice.actions;
export default authSlice.reducer;
