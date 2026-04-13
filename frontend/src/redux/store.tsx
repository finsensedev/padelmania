import { combineReducers, configureStore } from "@reduxjs/toolkit";

import userReducer from "./slicers/userSlice";
import tokenReducer from "./slicers/sessionSlice";

const rootReducer = combineReducers({
  userState: userReducer,
  userSession: tokenReducer,
});

const store = configureStore({
  reducer: rootReducer,
  middleware: (getDefaultMiddleware) => getDefaultMiddleware({}),
  devTools: import.meta.env.DEV,
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export default store;
