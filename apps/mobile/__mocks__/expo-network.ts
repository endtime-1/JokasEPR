let _connected = true;
let _reachable = true;

export const getNetworkStateAsync = jest.fn(async () => ({
  isConnected: _connected,
  isInternetReachable: _reachable,
  type: _connected ? "WIFI" : "NONE",
}));

export function __setOnline(connected: boolean, reachable = connected) {
  _connected = connected;
  _reachable = reachable;
}
export function __reset() {
  _connected = true;
  _reachable = true;
}
