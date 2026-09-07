import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, BookOpen, Download, FileText, Search, Sparkles, UserRound, Wrench } from "lucide-react"
import { useState } from "react"
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom"
import api from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { PageTab, PageTabs } from "@/components/layout/PageTabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/components/ui/toast"

interface CommunityCharacter {
  id: string
  name: string
  summary: string
  image_url: string
  author: string
  author_level?: number
  prompt?: string
  preset_messages?: Array<{ role: "system" | "user" | "assistant"; content: string }>
  featured: boolean
  created_at: string
}

interface CommunityKnowledgeBase {
  id: string
  name: string
  description: string
  owner: string
  file_count: number
  created_at: string
  updated_at: string
}

interface CommunitySkill {
  id: string
  name: string
  summary: string
  content?: string
  author: string
  author_level?: number
  created_at: string
  updated_at: string
}

interface CommunityCategory { id: string; name: string; kind: "character" | "knowledge" | "skill" }

interface CommunityCharactersResponse { items?: unknown }
interface CommunityKnowledgeBasesResponse { items?: unknown }
interface CommunityCategoriesResponse { items?: unknown }

const communityCharactersQueryKey = (query: string, categoryID: string) => ["community-characters", query, categoryID] as const
const communityKnowledgeBasesQueryKey = (categoryID: string) => ["community-knowledge-bases", categoryID] as const

export default function Community() {
  const { id, knowledgeBaseID, skillID } = useParams()
  if (knowledgeBaseID) return <CommunityKnowledgeBaseDetail id={knowledgeBaseID} />
  if (skillID) return <CommunitySkillDetail id={skillID} />
  return id ? <CommunityCharacterDetail id={id} /> : <CommunityBrowse />
}

function CommunityBrowse() {
  const [searchParams, setSearchParams] = useSearchParams()
  const rawTab = searchParams.get("tab")
  const activeTab = rawTab === "knowledge" || rawTab === "skills" ? rawTab : "characters"

  const changeTab = (tab: string) => {
    setSearchParams(tab === "characters" ? {} : { tab })
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1"><h1 className="text-2xl font-semibold">社区</h1><p className="text-sm text-muted-foreground">探索可导入的 AI 角色、知识库和技能。</p></div>
      <PageTabs aria-label="社区导航">
        <PageTab active={activeTab === "characters"} onClick={() => changeTab("characters")}>角色</PageTab>
        <PageTab active={activeTab === "knowledge"} onClick={() => changeTab("knowledge")}>知识库</PageTab>
        <PageTab active={activeTab === "skills"} onClick={() => changeTab("skills")}>技能</PageTab>
      </PageTabs>
      {activeTab === "characters" ? <CommunityCharacterList /> : activeTab === "knowledge" ? <CommunityKnowledgeBaseList /> : <CommunitySkillList />}
    </div>
  )
}

function CommunityCharacterList() {
  const [query, setQuery] = useState("")
  const [categoryID, setCategoryID] = useState("")
  const categoriesQuery = useQuery<CommunityCategory[]>({ queryKey: ["community-categories", "character"], queryFn: async () => normalizeCategoryList((await api.get("/community/categories", { params: { kind: "character" } })).data) })
  const charactersQuery = useQuery<CommunityCharacter[]>({
    queryKey: communityCharactersQueryKey(query, categoryID),
    queryFn: async () => normalizeCharacterList((await api.get("/community/characters", { params: { limit: 24, offset: 0, q: query.trim() || undefined, category_id: categoryID || undefined } })).data),
  })
  const characters = charactersQuery.data || []

  return (
    <div className="space-y-6">
      <div className="flex w-full gap-2 sm:w-auto"><div className="relative min-w-0 flex-1 sm:w-72"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索角色" className="h-9 pl-9" /></div><Select value={categoryID || "all"} onValueChange={(value) => setCategoryID(value === "all" ? "" : value)}><SelectTrigger><SelectValue placeholder="全部分类" /></SelectTrigger><SelectContent><SelectItem value="all">全部分类</SelectItem>{(categoriesQuery.data || []).map((category) => <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>)}</SelectContent></Select></div>
      {charactersQuery.isError ? <CommunityState title="社区暂时不可用" description="无法获取角色列表，请稍后重试。" /> : charactersQuery.isLoading ? <CommunityState title="正在加载角色" description="" /> : characters.length === 0 ? <CommunityState title={query ? "没有匹配的角色" : "暂时还没有公开角色"} description={query ? "换一个关键词试试。" : "稍后再来看看。"} /> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{characters.map((character) => <CommunityCharacterCard key={character.id} character={character} />)}</div>}
    </div>
  )
}

function CommunityCharacterCard({ character }: { character: CommunityCharacter }) {
  return (
    <Link to={`/chat/community/${encodeURIComponent(character.id)}`} className="group block">
      <Card className="h-full transition-colors group-hover:border-primary/50 group-hover:bg-muted/30">
        <CardHeader className="gap-4"><CharacterCover character={character} /><div className="min-w-0 space-y-2"><div className="flex items-center gap-2"><CardTitle className="truncate text-base">{character.name}</CardTitle>{character.featured && <Badge variant="secondary" className="gap-1"><Sparkles size={12} />精选</Badge>}</div><CardDescription className="line-clamp-2 min-h-10">{character.summary || "这位创作者还没有留下简介。"}</CardDescription></div></CardHeader>
        <CardFooter className="justify-between text-xs text-muted-foreground"><span className="truncate">{character.author || "匿名创作者"}</span><span>{formatDate(character.created_at)}</span></CardFooter>
      </Card>
    </Link>
  )
}

function CommunityKnowledgeBaseList() {
  const [query, setQuery] = useState("")
  const [categoryID, setCategoryID] = useState("")
  const categoriesQuery = useQuery<CommunityCategory[]>({ queryKey: ["community-categories", "knowledge"], queryFn: async () => normalizeCategoryList((await api.get("/community/categories", { params: { kind: "knowledge" } })).data) })
  const knowledgeBasesQuery = useQuery<CommunityKnowledgeBase[]>({
    queryKey: communityKnowledgeBasesQueryKey(categoryID),
    queryFn: async () => normalizeKnowledgeBaseList((await api.get("/community/knowledge-bases", { params: { category_id: categoryID || undefined } })).data),
  })
  const knowledgeBases = (knowledgeBasesQuery.data || []).filter((base) => !query.trim() || `${base.name} ${base.description} ${base.owner}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))

  return (
    <div className="space-y-6">
      <div className="flex w-full gap-2 sm:w-auto"><div className="relative min-w-0 flex-1 sm:w-72"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索知识库" className="h-9 pl-9" /></div><Select value={categoryID || "all"} onValueChange={(value) => setCategoryID(value === "all" ? "" : value)}><SelectTrigger><SelectValue placeholder="全部分类" /></SelectTrigger><SelectContent><SelectItem value="all">全部分类</SelectItem>{(categoriesQuery.data || []).map((category) => <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>)}</SelectContent></Select></div>
      {knowledgeBasesQuery.isError ? <CommunityState title="社区暂时不可用" description="无法获取知识库列表，请稍后重试。" /> : knowledgeBasesQuery.isLoading ? <CommunityState title="正在加载知识库" description="" /> : knowledgeBases.length === 0 ? <CommunityState title={query ? "没有匹配的知识库" : "暂时还没有公开知识库"} description={query ? "换一个关键词试试。" : "稍后再来看看。"} /> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{knowledgeBases.map((knowledgeBase) => <CommunityKnowledgeBaseCard key={knowledgeBase.id} knowledgeBase={knowledgeBase} />)}</div>}
    </div>
  )
}

function CommunityKnowledgeBaseCard({ knowledgeBase }: { knowledgeBase: CommunityKnowledgeBase }) {
  return (
    <Link to={`/chat/community/knowledge-bases/${encodeURIComponent(knowledgeBase.id)}`} className="group block">
      <Card className="h-full transition-colors group-hover:border-primary/50 group-hover:bg-muted/30">
        <CardHeader className="gap-3"><div className="flex items-center gap-2"><BookOpen className="size-5 text-primary" /><CardTitle className="truncate text-base">{knowledgeBase.name}</CardTitle></div><CardDescription className="line-clamp-3 min-h-14">{knowledgeBase.description || "这份知识库还没有留下简介。"}</CardDescription></CardHeader>
        <CardFooter className="justify-between gap-3 text-xs text-muted-foreground"><span className="truncate">{knowledgeBase.owner || "匿名创作者"}</span><span>{knowledgeBase.file_count} 个文件</span></CardFooter>
      </Card>
    </Link>
  )
}

function CommunitySkillList() {
  const [query, setQuery] = useState("")
  const [categoryID, setCategoryID] = useState("")
  const categoriesQuery = useQuery<CommunityCategory[]>({ queryKey: ["community-categories", "skill"], queryFn: async () => normalizeCategoryList((await api.get("/community/categories", { params: { kind: "skill" } })).data) })
  const skillsQuery = useQuery<CommunitySkill[]>({
    queryKey: ["community-skills", query, categoryID],
    queryFn: async () => normalizeSkillList((await api.get("/community/skills", { params: { limit: 24, offset: 0, q: query.trim() || undefined, category_id: categoryID || undefined } })).data),
  })
  const skills = skillsQuery.data || []

  return (
    <div className="space-y-6">
      <div className="flex w-full gap-2 sm:w-auto"><div className="relative min-w-0 flex-1 sm:w-72"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索技能" className="h-9 pl-9" /></div><Select value={categoryID || "all"} onValueChange={(value) => setCategoryID(value === "all" ? "" : value)}><SelectTrigger><SelectValue placeholder="全部分类" /></SelectTrigger><SelectContent><SelectItem value="all">全部分类</SelectItem>{(categoriesQuery.data || []).map((category) => <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>)}</SelectContent></Select></div>
      {skillsQuery.isError ? <CommunityState title="社区暂时不可用" description="无法获取技能列表，请稍后重试。" /> : skillsQuery.isLoading ? <CommunityState title="正在加载技能" description="" /> : skills.length === 0 ? <CommunityState title={query ? "没有匹配的技能" : "暂时还没有公开技能"} description={query ? "换一个关键词试试。" : "稍后再来看看。"} /> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{skills.map((skill) => <CommunitySkillCard key={skill.id} skill={skill} />)}</div>}
    </div>
  )
}

function CommunitySkillCard({ skill }: { skill: CommunitySkill }) {
  return (
    <Link to={`/chat/community/skills/${encodeURIComponent(skill.id)}`} className="group block">
      <Card className="h-full transition-colors group-hover:border-primary/50 group-hover:bg-muted/30">
        <CardHeader className="gap-3"><div className="flex items-center gap-2"><Wrench className="size-5 text-primary" /><CardTitle className="truncate text-base">{skill.name}</CardTitle></div><CardDescription className="line-clamp-3 min-h-14">{skill.summary || "这份技能还没有留下简介。"}</CardDescription></CardHeader>
        <CardFooter className="justify-between gap-3 text-xs text-muted-foreground"><span className="truncate">{skill.author || "匿名创作者"}</span><span>{formatDate(skill.created_at)}</span></CardFooter>
      </Card>
    </Link>
  )
}

function CommunitySkillDetail({ id }: { id: string }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { error, success } = useToast()
  const [isImporting, setIsImporting] = useState(false)
  const skillQuery = useQuery<CommunitySkill>({ queryKey: ["community-skill", id], queryFn: async () => {
    const skill = normalizeSkill((await api.get(`/community/skills/${encodeURIComponent(id)}`)).data)
    if (!skill) throw new Error("技能数据无效")
    return skill
  } })
  const skill = skillQuery.data
  const importSkill = async () => {
    if (!skill || isImporting) return
    setIsImporting(true)
    try {
      await api.post(`/user/advanced-chat/community/skills/${encodeURIComponent(skill.id)}/import`)
      await queryClient.invalidateQueries({ queryKey: ["skill-packages"] })
      success("技能已导入，可在技能页启用")
      navigate("/chat/skills")
    } catch (err) { error(apiErrorMessage(err, "导入技能失败")) } finally { setIsImporting(false) }
  }

  if (skillQuery.isLoading) return <CommunityState title="正在加载技能" description="" />
  if (skillQuery.isError || !skill) return <div className="space-y-4"><BackToCommunity tab="skills" /><CommunityState title="无法打开技能" description="该技能可能已下架，或社区暂时不可用。" /></div>
  return <div className="mx-auto max-w-3xl space-y-6"><BackToCommunity tab="skills" /><Card><CardHeader className="gap-4"><div className="flex items-start gap-3"><Wrench className="mt-1 size-6 shrink-0 text-primary" /><div className="min-w-0 space-y-2"><CardTitle className="text-2xl">{skill.name}</CardTitle><CardDescription className="whitespace-pre-wrap leading-6">{skill.summary || "这份技能还没有留下简介。"}</CardDescription></div></div><div className="flex flex-wrap gap-3 text-sm text-muted-foreground"><span className="inline-flex items-center gap-1"><UserRound size={14} />{skill.author || "匿名创作者"}</span>{skill.author_level ? <Badge variant="outline">Lv.{skill.author_level}</Badge> : null}<span>{formatDate(skill.updated_at || skill.created_at)}</span></div></CardHeader><CardContent className="space-y-3"><h2 className="text-sm font-medium">SKILL.md</h2><pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/40 p-4 font-mono text-xs leading-5 text-foreground">{skill.content || "内容暂不可用。"}</pre></CardContent><CardFooter><Button className="gap-2" disabled={!skill.content || isImporting} onClick={importSkill}><Download size={16} />{isImporting ? "正在导入" : "导入技能"}</Button></CardFooter></Card></div>
}

function CommunityCharacterDetail({ id }: { id: string }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { error, success } = useToast()
  const [isImporting, setIsImporting] = useState(false)
  const characterQuery = useQuery<CommunityCharacter>({
    queryKey: ["community-character", id],
    queryFn: async () => {
      const character = normalizeCharacter((await api.get(`/community/characters/${encodeURIComponent(id)}`)).data)
      if (!character) throw new Error("角色数据无效")
      return character
    },
  })
  const character = characterQuery.data

  const importCharacter = async () => {
    if (!character?.prompt || isImporting) return
    setIsImporting(true)
    try {
      const response = await api.post("/user/advanced-chat/agents", { name: character.name, prompt: character.prompt, default_model: "", user_channel_id: 0, stream: false, skill_ids: [], mcp_server_ids: [], knowledge_base_ids: [], preset_messages: character.preset_messages || [] })
      const agentID = stringValue(response.data?.id)
      if (!agentID) throw new Error("代理创建结果无效")
      queryClient.removeQueries({ queryKey: ["advanced-chat-agents"] })
      success("角色已导入代理")
      navigate(`/chat?agent_id=${encodeURIComponent(agentID)}`)
    } catch (err) { error(apiErrorMessage(err, "导入角色失败")) } finally { setIsImporting(false) }
  }

  if (characterQuery.isLoading) return <CommunityState title="正在加载角色" description="" />
  if (characterQuery.isError || !character) return <div className="space-y-4"><BackToCommunity /><CommunityState title="无法打开角色" description="该角色可能已下架，或社区暂时不可用。" /></div>
  return <div className="mx-auto max-w-3xl space-y-6"><BackToCommunity /><Card><CardHeader className="gap-5 sm:flex-row sm:items-start"><CharacterCover character={character} large /><div className="min-w-0 flex-1 space-y-3"><div className="flex flex-wrap items-center gap-2"><CardTitle className="text-2xl">{character.name}</CardTitle>{character.featured && <Badge className="gap-1"><Sparkles size={12} />精选</Badge>}</div><CardDescription className="whitespace-pre-wrap leading-6">{character.summary || "这位创作者还没有留下简介。"}</CardDescription><div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"><span className="inline-flex items-center gap-1"><UserRound size={14} />{character.author || "匿名创作者"}</span>{character.author_level ? <Badge variant="outline">Lv.{character.author_level}</Badge> : null}<span>{formatDate(character.created_at)}</span></div></div></CardHeader><CardContent className="space-y-3"><h2 className="text-sm font-medium">角色提示词</h2><pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/40 p-4 font-sans text-sm leading-6 text-foreground">{character.prompt || "提示词暂不可用。"}</pre></CardContent><CardFooter><Button className="gap-2" disabled={!character.prompt || isImporting} onClick={importCharacter}><Download size={16} />{isImporting ? "正在导入" : "导入角色"}</Button></CardFooter></Card></div>
}

function CommunityKnowledgeBaseDetail({ id }: { id: string }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { error, success } = useToast()
  const [isImporting, setIsImporting] = useState(false)
  const knowledgeBaseQuery = useQuery<CommunityKnowledgeBase>({ queryKey: ["community-knowledge-base", id], queryFn: async () => {
    const knowledgeBase = normalizeKnowledgeBase((await api.get(`/community/knowledge-bases/${encodeURIComponent(id)}`)).data)
    if (!knowledgeBase) throw new Error("知识库数据无效")
    return knowledgeBase
  } })
  const knowledgeBase = knowledgeBaseQuery.data
  const importKnowledgeBase = async () => {
    if (!knowledgeBase || isImporting) return
    setIsImporting(true)
    try {
      await api.post(`/user/advanced-chat/community/knowledge-bases/${encodeURIComponent(knowledgeBase.id)}/import`)
      await queryClient.invalidateQueries({ queryKey: ["knowledge-bases"] })
      success("知识库已导入，请配置模型后向量化")
      navigate("/chat/knowledge")
    } catch (err) { error(apiErrorMessage(err, "导入知识库失败")) } finally { setIsImporting(false) }
  }

  if (knowledgeBaseQuery.isLoading) return <CommunityState title="正在加载知识库" description="" />
  if (knowledgeBaseQuery.isError || !knowledgeBase) return <div className="space-y-4"><BackToCommunity tab="knowledge" /><CommunityState title="无法打开知识库" description="该知识库可能已下架，或社区暂时不可用。" /></div>
  return <div className="mx-auto max-w-3xl space-y-6"><BackToCommunity tab="knowledge" /><Card><CardHeader className="gap-4"><div className="flex items-start gap-3"><BookOpen className="mt-1 size-6 shrink-0 text-primary" /><div className="min-w-0 space-y-2"><CardTitle className="text-2xl">{knowledgeBase.name}</CardTitle><CardDescription className="whitespace-pre-wrap leading-6">{knowledgeBase.description || "这份知识库还没有留下简介。"}</CardDescription></div></div><div className="flex flex-wrap gap-3 text-sm text-muted-foreground"><span className="inline-flex items-center gap-1"><UserRound size={14} />{knowledgeBase.owner || "匿名创作者"}</span><span className="inline-flex items-center gap-1"><FileText size={14} />{knowledgeBase.file_count} 个文件</span><span>{formatDate(knowledgeBase.updated_at || knowledgeBase.created_at)}</span></div></CardHeader><CardContent className="text-sm text-muted-foreground">导入后将生成一份仅属于你的知识库，并保留原始文本文件。选择嵌入模型并向量化后即可在代理中使用。</CardContent><CardFooter><Button className="gap-2" disabled={isImporting} onClick={importKnowledgeBase}><Download size={16} />{isImporting ? "正在导入" : "导入知识库"}</Button></CardFooter></Card></div>
}

function BackToCommunity({ tab }: { tab?: "knowledge" | "skills" }) { const navigate = useNavigate(); return <Button variant="ghost" className="gap-2" onClick={() => navigate(tab ? `/chat/community?tab=${tab}` : "/chat/community")}><ArrowLeft size={16} />返回社区</Button> }
function CharacterCover({ character, large = false }: { character: CommunityCharacter; large?: boolean }) { const sizeClass = large ? "size-32 text-4xl" : "aspect-[16/9] w-full text-3xl"; if (character.image_url) return <img src={character.image_url} alt={`${character.name} 封面`} className={`${sizeClass} shrink-0 rounded-md border object-cover`} />; return <div className={`${sizeClass} flex shrink-0 items-center justify-center rounded-md border bg-muted font-semibold text-muted-foreground`}>{character.name.slice(0, 1).toUpperCase() || "角"}</div> }
function CommunityState({ title, description }: { title: string; description: string }) { return <div className="flex min-h-48 flex-col items-center justify-center rounded-md border border-dashed px-4 text-center"><p className="font-medium">{title}</p>{description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}</div> }
function normalizeCharacterList(value: unknown): CommunityCharacter[] { const response = isRecord(value) ? value as CommunityCharactersResponse : {}; return Array.isArray(response.items) ? response.items.map(normalizeCharacter).filter((item): item is CommunityCharacter => Boolean(item)) : [] }
function normalizeCharacter(value: unknown): CommunityCharacter | null { if (!isRecord(value)) return null; const id = stringValue(value.id); const name = stringValue(value.name); if (!id || !name) return null; return { id, name, summary: stringValue(value.summary), image_url: stringValue(value.image_url), author: stringValue(value.author), author_level: numberValue(value.author_level), prompt: stringValue(value.prompt) || undefined, preset_messages: normalizePresetMessages(value.preset_messages), featured: value.featured === true, created_at: stringValue(value.created_at) } }
function normalizeKnowledgeBaseList(value: unknown): CommunityKnowledgeBase[] { const response = isRecord(value) ? value as CommunityKnowledgeBasesResponse : {}; return Array.isArray(response.items) ? response.items.map(normalizeKnowledgeBase).filter((item): item is CommunityKnowledgeBase => Boolean(item)) : [] }
function normalizeCategoryList(value: unknown): CommunityCategory[] { const response = isRecord(value) ? value as CommunityCategoriesResponse : {}; return Array.isArray(response.items) ? response.items.flatMap((item) => { if (!isRecord(item)) return []; const id = stringValue(item.id); const name = stringValue(item.name); const kind = stringValue(item.kind); return id && name && (kind === "character" || kind === "knowledge" || kind === "skill") ? [{ id, name, kind }] : [] }) : [] }
function normalizeSkillList(value: unknown): CommunitySkill[] { const response = isRecord(value) ? value as { items?: unknown } : {}; return Array.isArray(response.items) ? response.items.map(normalizeSkill).filter((item): item is CommunitySkill => Boolean(item)) : [] }
function normalizeSkill(value: unknown): CommunitySkill | null { if (!isRecord(value)) return null; const id = stringValue(value.id); const name = stringValue(value.name); if (!id || !name) return null; return { id, name, summary: stringValue(value.summary), content: stringValue(value.content) || undefined, author: stringValue(value.author), author_level: numberValue(value.author_level), created_at: stringValue(value.created_at), updated_at: stringValue(value.updated_at) } }
function normalizeKnowledgeBase(value: unknown): CommunityKnowledgeBase | null { if (!isRecord(value)) return null; const id = stringValue(value.id); const name = stringValue(value.name); if (!id || !name) return null; return { id, name, description: stringValue(value.description), owner: stringValue(value.owner), file_count: nonNegativeNumber(value.file_count), created_at: stringValue(value.created_at), updated_at: stringValue(value.updated_at) } }
function normalizePresetMessages(value: unknown): Array<{ role: "system" | "user" | "assistant"; content: string }> { if (!Array.isArray(value)) return []; return value.flatMap((item) => { if (!isRecord(item)) return []; const role = stringValue(item.role); const content = stringValue(item.content); if (!content || (role !== "system" && role !== "user" && role !== "assistant")) return []; return [{ role, content }] }) }
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("zh-CN") }
function stringValue(value: unknown) { return typeof value === "string" ? value : typeof value === "number" ? String(value) : "" }
function numberValue(value: unknown) { const number = Number(value); return Number.isFinite(number) && number > 0 ? number : undefined }
function nonNegativeNumber(value: unknown) { const number = Number(value); return Number.isFinite(number) && number >= 0 ? number : 0 }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null }
function apiErrorMessage(err: unknown, fallback: string) { if (isRecord(err) && isRecord(err.response) && isRecord(err.response.data)) { const message = stringValue(err.response.data.error) || stringValue(err.response.data.message); if (message) return message }; return err instanceof Error && err.message ? err.message : fallback }
