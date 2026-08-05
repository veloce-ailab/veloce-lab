import { CalendarIcon } from "lucide-react"
import { format } from "date-fns"
import { enUS, ja, zhCN } from "date-fns/locale"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

interface DatePickerProps {
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  className?: string
}

export function DatePicker({ value, onValueChange, placeholder, className }: DatePickerProps) {
  const { language } = useI18n()
  const date = parseDate(value)
  const locale = language === "zh" ? zhCN : language === "ja" ? ja : enUS
  const emptyLabel = placeholder || (language === "zh" ? "选择日期" : language === "ja" ? "日付を選択" : "Pick a date")

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn("h-10 w-full justify-start gap-2 px-3 text-left font-normal", !date && "text-muted-foreground", className)}>
          <CalendarIcon size={16} />
          {date ? format(date, "PPP", { locale }) : emptyLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={date} onSelect={(nextDate) => onValueChange(nextDate ? formatDateValue(nextDate) : "")} locale={locale} />
      </PopoverContent>
    </Popover>
  )
}

function parseDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return undefined
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return Number.isNaN(date.getTime()) ? undefined : date
}

function formatDateValue(value: Date) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, "0")
  const day = String(value.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function DateTimePicker({ value, onValueChange, placeholder, className }: DatePickerProps) {
  const { language } = useI18n()
  const date = parseDateTime(value)
  const locale = language === "zh" ? zhCN : language === "ja" ? ja : enUS
  const time = date ? format(date, "HH:mm") : "00:00"
  const emptyLabel = placeholder || (language === "zh" ? "选择日期与时间" : language === "ja" ? "日時を選択" : "Pick date and time")
  const update = (nextDate: Date, nextTime: string) => {
    const [hours, minutes] = nextTime.split(":").map(Number)
    nextDate.setHours(hours || 0, minutes || 0, 0, 0)
    onValueChange(`${formatDateValue(nextDate)}T${format(nextDate, "HH:mm")}`)
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn("h-10 w-full justify-start gap-2 px-3 text-left font-normal", !date && "text-muted-foreground", className)}>
          <CalendarIcon size={16} />
          {date ? format(date, "PPP p", { locale }) : emptyLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={date} onSelect={(nextDate) => { if (nextDate) update(nextDate, time) }} locale={locale} />
        <div className="border-t p-3">
          <Select value={time} onValueChange={(nextTime) => update(date ? new Date(date) : new Date(), nextTime)}>
            <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{timeOptions.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </PopoverContent>
    </Popover>
  )
}

const timeOptions = Array.from({ length: 48 }, (_, index) => `${String(Math.floor(index / 2)).padStart(2, "0")}:${index % 2 ? "30" : "00"}`)

function parseDateTime(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value)
  if (!match) return undefined
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]))
  return Number.isNaN(date.getTime()) ? undefined : date
}
