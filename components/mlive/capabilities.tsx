"use client";

import { createContext, useContext } from "react";

const IntradayRetiredContext = createContext(false);

export function IntradayRetiredProvider({ retired, children }: { retired: boolean; children: React.ReactNode }) {
  return <IntradayRetiredContext.Provider value={retired}>{children}</IntradayRetiredContext.Provider>;
}

export function useIntradayRetired(): boolean {
  return useContext(IntradayRetiredContext);
}
