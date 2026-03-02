"use client"

import { usePathname } from "next/navigation"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { useSession, signOut } from "@/lib/auth-client"
import { api } from "@/lib/api"
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
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Boards", href: "/boards", icon: Kanban },
  { label: "Projects", href: "/projects", icon: FolderOpen },
  { label: "Skills", href: "/skills", icon: Sparkles },
  { label: "Metrics", href: "/metrics", icon: BarChart3 },
  { label: "Settings", href: "/settings", icon: Settings },
]

function isNavActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/"
  return pathname === href || pathname.startsWith(href + "/")
}

export function AppSidebar() {
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
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={isNavActive(pathname, item.href)}
                    tooltip={item.label}
                  >
                    <Link href={item.href} onClick={handleNavClick}>
                      <item.icon />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Project switcher */}
        <SidebarGroup>
          <SidebarGroupLabel>Projects</SidebarGroupLabel>
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
                  No projects yet
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
            <SidebarMenuButton onClick={handleLogout} tooltip="Logout">
              <LogOut />
              <span>Logout</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
