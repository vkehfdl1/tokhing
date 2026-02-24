export const WALLET_BALANCE_REFRESH_EVENT = "tokhin:wallet-balance-refresh";

export const notifyWalletBalanceRefresh = () => {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(WALLET_BALANCE_REFRESH_EVENT));
};
