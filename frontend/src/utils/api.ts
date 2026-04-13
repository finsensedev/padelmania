/* eslint-disable @typescript-eslint/no-explicit-any */
import axios, { type AxiosInstance, type AxiosError } from "axios";
import store from "src/redux/store";
import authServiceInstance from "src/services/authService";

const RAW_BASE = import.meta.env.VITE_BACKEND_URL || "http://localhost:8070";
const NORMALIZED_BASE = RAW_BASE.replace(/\/?$/u, "");

const API_URL = `${NORMALIZED_BASE.replace(/\/+$/u, "")}/api`;

const api: AxiosInstance = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  withCredentials: true,
});

api.interceptors.request.use(
  (config) => {
    const state = store.getState();

    config.headers["X-Request-ID"] = `req_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    // Correct slice path (userState) to obtain persisted user
    const currentUser = (state as any).userState?.user;
    if (currentUser && currentUser.id) {
      config.headers["X-User-ID"] = currentUser.id;
      config.headers["X-User-Role"] = currentUser.role;
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as any;

    // If backend signals a 2FA step-up requirement or invalid 2FA, do NOT attempt refresh token logic.
    const errorData: any = error.response?.data;
    const code = errorData?.code;
    if (
      code === "TWO_FACTOR_REQUIRED" ||
      code === "TWO_FACTOR_INVALID" ||
      code === "TWO_FACTOR_SESSION_INVALID"
    ) {
      // Pass through without triggering refresh; caller decides to prompt.
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        await authServiceInstance.refreshAccessToken();

        return api(originalRequest);
      } catch (refreshError) {
        authServiceInstance.clearAllAuthData();
        return Promise.reject(refreshError);
      }
    }

    if (error.response?.status === 401) {
      authServiceInstance.clearAllAuthData();
    }

    return Promise.reject(error);
  }
);

export const { CancelToken } = axios;
export const { isCancel } = axios;

export default api;
