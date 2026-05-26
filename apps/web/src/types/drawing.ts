export type DrawingTool =
  | 'cursor'
  | 'line'
  | 'hline'
  | 'vline'
  | 'ray'
  | 'rect'
  | 'fib'
  | 'text'
  | 'arrow'
  | 'measure'
  | 'eraser'

export interface DrawingPt {
  time: number
  price: number
}

export interface Drawing {
  id: string
  type: 'line' | 'hline' | 'vline' | 'ray' | 'rect' | 'fib' | 'text' | 'arrow' | 'measure'
  pts: DrawingPt[]
  color: string
  width: number
  dash: boolean
  text?: string
}
