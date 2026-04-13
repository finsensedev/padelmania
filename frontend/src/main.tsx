import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter as Router } from "react-router-dom";
import { Provider as ReduxProvider } from "react-redux";
import store from "./redux/store";
import "./index.css";

import { QueryClient, QueryClientProvider } from "react-query";
import { ThemeProvider } from "./contexts/ThemeProvider.tsx";
import NotificationProvider from "./contexts/NotificationProvider";
import App from "./App.tsx";
import { ModalProvider } from "./contexts/ModalProvider";
import { SocketProvider } from "./contexts/SocketProvider.tsx";

const clientQuery = new QueryClient({});

const div = document.getElementById("root");

ReactDOM.createRoot(div!).render(
  <StrictMode>
    <Router>
      <ThemeProvider>
        <SocketProvider>
          <NotificationProvider>
            <ReduxProvider store={store}>
              <QueryClientProvider client={clientQuery}>
                {/* <PersistGate
                  persistor={persistor}
                  loading={
                    <div className="h-[100dvh]">
                      <SettingUpAnApp />
                    </div>
                  }
                > */}
                <ModalProvider>
                  <App />
                </ModalProvider>
                {/* </PersistGate> */}
              </QueryClientProvider>
            </ReduxProvider>
          </NotificationProvider>
        </SocketProvider>
      </ThemeProvider>
    </Router>
  </StrictMode>
);
