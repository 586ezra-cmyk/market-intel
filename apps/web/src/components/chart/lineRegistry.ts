// רישום של כל קו שמצויר על הגרף, כדי שבלחיצה על קו אפשר יהיה להסביר בדיוק מה הוא ומה המספרים שלו.
// כל שכבה שמציירת קווים רושמת אותם כאן תחת שם המקור שלה.
import type { LayerId } from '@/store/marketStore'

export interface LineInfo {
  price: number
  title: string            // השם שעל הקו
  layer: LayerId
  what: string             // מה זה, במילים פשוטות
  source: string           // מאיפה הנתון ומתי עודכן
  facts?: string[]         // מספרים נוספים
}

const reg = new Map<string, LineInfo[]>()
export function setLines(source: string, lines: LineInfo[]): void { reg.set(source, lines) }
export function allLines(): LineInfo[] { return [...reg.values()].flat() }
