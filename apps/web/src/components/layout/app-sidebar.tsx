"use client"

import { usePathname } from "next/navigation"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { useSession, signOut } from "@/lib/auth-client"
import { api } from "@/lib/api"
import { useTranslation } from "@/i18n/language-context"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSkeleton,
  useSidebar,
} from "@/components/ui/sidebar"
import {
  LayoutDashboard,
  Kanban,
  FolderOpen,
  BarChart3,
  Sparkles,
  Settings,
  LogOut,
  User,
} from "lucide-react"

const NAV_ITEMS = [
  { labelKey: "sidebar.dashboard" as const, href: "/", icon: LayoutDashboard },
  { labelKey: "sidebar.boards" as const, href: "/boards", icon: Kanban },
  { labelKey: "sidebar.projects" as const, href: "/projects", icon: FolderOpen },
  { labelKey: "sidebar.skills" as const, href: "/skills", icon: Sparkles },
  { labelKey: "sidebar.metrics" as const, href: "/metrics", icon: BarChart3 },
  { labelKey: "sidebar.settings" as const, href: "/settings", icon: Settings },
]

function isNavActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/"
  return pathname === href || pathname.startsWith(href + "/")
}

export function AppSidebar() {
  const { t } = useTranslation()
  const pathname = usePathname()
  const router = useRouter()
  const { data: session } = useSession()
  const { setOpenMobile } = useSidebar()

  const { data, isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: () =>
      api.get<{ projects: { id: string; name: string }[] }>("/api/projects"),
  })

  const projects = data?.projects ?? []

  async function handleLogout() {
    await signOut()
    router.push("/login")
  }

  function handleNavClick() {
    setOpenMobile(false)
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip="TechTeam">
              <Link href="/" onClick={handleNavClick}>
                <Kanban className="text-primary" />
                <span className="font-semibold">TechTeam</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {/* Main navigation */}
        <SidebarGroup>
          <SidebarGroupLabel>{t("sidebar.navigation")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={isNavActive(pathname, item.href)}
                    tooltip={t(item.labelKey)}
                  >
                    <Link href={item.href} onClick={handleNavClick}>
                      <item.icon />
                      <span>{t(item.labelKey)}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Project switcher */}
        <SidebarGroup>
          <SidebarGroupLabel>{t("sidebar.projects")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {isLoading ? (
                <>
                  <SidebarMenuSkeleton showIcon />
                  <SidebarMenuSkeleton showIcon />
                  <SidebarMenuSkeleton showIcon />
                </>
              ) : projects.length === 0 ? (
                <li className="px-2 py-1.5 text-xs text-muted-foreground">
                  {t("sidebar.noProjects")}
                </li>
              ) : (
                projects.map((project) => (
                  <SidebarMenuItem key={project.id}>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname === `/projects/${project.id}/board`}
                      tooltip={project.name}
                    >
                      <Link
                        href={`/projects/${project.id}/board`}
                        onClick={handleNavClick}
                      >
                        <Kanban />
                        <span>{project.name}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip={session?.user?.email ?? "User"}>
              <User />
              <span className="truncate">{session?.user?.email}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleLogout} tooltip={t("sidebar.logout")}>
              <LogOut />
              <span>{t("sidebar.logout")}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
