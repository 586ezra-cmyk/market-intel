// מצב משותף קטן בין טעינת הנרות (TradingChart) לבין הנר החי מהעיניים (LiveCandleLayer).
// lastReal* = הנר הסגור האחרון שהגיע מהשרת. formingTime = זמן הנר החי שמצויר כרגע (0 = אין).
export const chartFeed = { lastRealTime: 0, lastRealClose: 0, formingTime: 0 }
