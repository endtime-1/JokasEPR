const _mockDb = {
  execAsync: jest.fn().mockResolvedValue(undefined),
  runAsync: jest.fn().mockResolvedValue(undefined),
  getAllAsync: jest.fn().mockResolvedValue([]),
  getFirstAsync: jest.fn().mockResolvedValue(null),
};

export const openDatabaseAsync = jest.fn().mockResolvedValue(_mockDb);

export function __getMockDb() {
  return _mockDb;
}
export function __reset() {
  Object.values(_mockDb).forEach((fn) => (fn as jest.Mock).mockReset());
  _mockDb.execAsync.mockResolvedValue(undefined);
  _mockDb.runAsync.mockResolvedValue(undefined);
  _mockDb.getAllAsync.mockResolvedValue([]);
  _mockDb.getFirstAsync.mockResolvedValue(null);
  openDatabaseAsync.mockResolvedValue(_mockDb);
}
