import { Bell, ChevronLeft } from "lucide-react"
import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import api from "@/lib/api"
import { useI18n } from "@/lib/i18n"

interface Announcement {
  id: number
  title: string
  content: string
  created_at: string
}

export function AnnouncementButton() {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<Announcement | null>(null)
  const { language, t } = useI18n()
  const { data: announcements = [], isLoading } = useQuery<Announcement[]>({
    queryKey: ["public-announcements"],
    queryFn: async () => {
      const res = await api.get("/public/announcements")
      return Array.isArray(res.data) ? res.data : []
    },
  })
  const title = language === "zh" ? "公告" : language === "ja" ? "お知らせ" : "Announcements"

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (!nextOpen) setSelected(null)
  }

  return (
    <>
      <Button type="button" variant="outline" size="icon" className="relative" title={title} aria-label={title} onClick={() => setOpen(true)}>
        <Bell size={17} />
        {announcements.length > 0 && <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-primary" />}
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-h-[80vh] max-w-xl overflow-y-auto">
          {selected ? (
            <>
              <Button type="button" variant="ghost" size="sm" className="-ml-2 w-fit gap-1" onClick={() => setSelected(null)}>
                <ChevronLeft size={16} />
                {language === "zh" ? "返回列表" : language === "ja" ? "一覧に戻る" : "Back to list"}
              </Button>
              <DialogHeader><DialogTitle>{selected.title}</DialogTitle></DialogHeader>
              <div className="text-xs text-muted-foreground">{formatAnnouncementDate(selected.created_at, language)}</div>
              <div className="whitespace-pre-wrap text-sm leading-7 text-foreground">{selected.content}</div>
            </>
          ) : (
            <>
              <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
              {isLoading ? (
                <div className="py-10 text-center text-sm text-muted-foreground">{t("common.loading")}</div>
              ) : announcements.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">{language === "zh" ? "暂无公告" : language === "ja" ? "お知らせはありません" : "No announcements"}</div>
              ) : (
                <div className="space-y-2">
                  {announcements.map((announcement) => (
                    <Button key={announcement.id} type="button" variant="ghost" className="h-auto w-full items-start justify-start rounded-2xl px-3 py-3 text-left hover:bg-muted" onClick={() => setSelected(announcement)}>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{announcement.title}</span>
                        <span className="mt-1 block line-clamp-2 whitespace-normal text-xs font-normal text-muted-foreground">{announcement.content}</span>
                        <span className="mt-2 block text-xs font-normal text-muted-foreground">{formatAnnouncementDate(announcement.created_at, language)}</span>
                      </span>
                    </Button>
                  ))}
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

function formatAnnouncementDate(value: string, language: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(language === "zh" ? "zh-CN" : language === "ja" ? "ja-JP" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}
