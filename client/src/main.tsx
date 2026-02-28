import { StrictMode, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { SpacetimeDBProvider } from 'spacetimedb/react';
import type { Identity } from 'spacetimedb';
import { DbConnection, type ErrorContext } from './module_bindings';
import App from './App';
import './index.css';

const SPACETIMEDB_URI =
  import.meta.env.VITE_SPACETIMEDB_URI || 'ws://localhost:3000';
const DB_NAME =
  import.meta.env.VITE_SPACETIMEDB_MODULE || 'tdc-games';

function Root() {
  const connectionBuilder = useMemo(
    () =>
      DbConnection.builder()
        .withUri(SPACETIMEDB_URI)
        .withDatabaseName(DB_NAME)
        .withToken(localStorage.getItem('stdb_auth_token') || undefined)
        .onConnect((_conn: DbConnection, identity: Identity, token: string) => {
          localStorage.setItem('stdb_auth_token', token);
          console.log('Connected:', identity.toHexString());
        })
        .onDisconnect((_ctx: ErrorContext) => console.log('Disconnected'))
        .onConnectError((_ctx: ErrorContext, err: Error) =>
          console.error('Connection error:', err)
        ),
    []
  );

  return (
    <SpacetimeDBProvider connectionBuilder={connectionBuilder}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </SpacetimeDBProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>
);
