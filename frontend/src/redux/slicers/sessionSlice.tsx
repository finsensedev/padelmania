import { createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";

interface TokenState {
  sessionActive: boolean;
  expiresAt: number | null;
}

const initialState: TokenState = {
  sessionActive: false,
  expiresAt: null,
};

export const sessionSlice = createSlice({
  name: "userSession",
  initialState,
  reducers: {
    setSession: (
      state,
      action: PayloadAction<{ expiresIn?: number } | undefined>
    ) => {
      state.sessionActive = true;

      const expiresIn = action.payload?.expiresIn;
      if (typeof expiresIn === "number") {
        state.expiresAt = Date.now() + expiresIn * 1000;
      } else {
        state.expiresAt = null;
      }
    },
    clearSession: (state) => {
      state.sessionActive = false;
      state.expiresAt = null;
    },
  },
});

export const { setSession, clearSession } = sessionSlice.actions;

export default sessionSlice.reducer;
