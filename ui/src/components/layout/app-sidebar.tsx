import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Home,
  Key,
  Zap,
  Users,
  Settings,
  Activity,
  FolderOpen,
  ChevronRight,
  BarChart3,
  Gauge,
  Github,
  Puzzle,
  TerminalSquare,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarFooter,
  SidebarTrigger,
  SidebarGroupContent,
} from '@/components/ui/sidebar';
import { CcsLogo } from '@/components/shared/ccs-logo';
import { useSidebar } from '@/hooks/use-sidebar';
import { useCliproxyUpdateCheck } from '@/hooks/use-cliproxy';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface SidebarBadge {
  icon?: string;
  icons?: string[];
  text?: string;
}

interface SidebarChildItem {
  path: string;
  label: string;
  icon?: LucideIcon;
}

interface SidebarItem {
  path: string;
  label: string;
  icon?: LucideIcon;
  iconSrc?: string;
  badge?: SidebarBadge;
  isCollapsible?: boolean;
  children?: SidebarChildItem[];
}

interface SidebarGroupDef {
  title: string;
  items: SidebarItem[];
}

function buildNavGroups(t: (key: string) => string): SidebarGroupDef[] {
  return [
    {
      title: t('nav.general'),
      items: [
        { path: '/', icon: Home, label: t('nav.home') },
        { path: '/analytics', icon: BarChart3, label: t('nav.analytics') },
      ],
    },
    {
      title: t('nav.identityAccess'),
      items: [
        {
          path: '/providers',
          icon: Key,
          label: t('nav.apiProfiles'),
          badge: {
            icons: [
              '/icons/openrouter.svg',
              '/assets/providers/alibabacloud-color.svg',
              '/icons/ollama.svg',
            ],
          },
        },
        {
          path: '/cliproxy',
          icon: Zap,
          label: t('nav.cliproxyPlus'),
          isCollapsible: true,
          children: [
            { path: '/cliproxy', label: t('nav.cliproxyOverview') },
            { path: '/cliproxy/ai-providers', icon: Key, label: 'AI Providers' },
            { path: '/cliproxy/control-panel', icon: Gauge, label: t('nav.controlPanel') },
          ],
        },
        { path: '/copilot', icon: Github, label: t('nav.githubCopilot') },
        { path: '/cursor', iconSrc: '/assets/sidebar/cursor.svg', label: t('nav.cursorIde') },
        {
          path: '/accounts',
          icon: Users,
          label: t('nav.accounts'),
          isCollapsible: true,
          children: [
            { path: '/accounts', label: t('nav.allAccounts') },
            { path: '/shared', icon: FolderOpen, label: t('nav.sharedData') },
          ],
        },
      ],
    },
    {
      title: t('nav.compatibleClis'),
      items: [
        { path: '/claude-extension', icon: Puzzle, label: t('nav.claudeExtension') },
        { path: '/codex', iconSrc: '/assets/providers/codex-color.svg', label: 'Codex CLI' },
        { path: '/droid', icon: TerminalSquare, label: t('nav.factoryDroid') },
      ],
    },
    {
      title: t('nav.system'),
      items: [
        { path: '/health', icon: Activity, label: t('nav.health') },
        { path: '/settings', icon: Settings, label: t('nav.settings') },
      ],
    },
  ];
}

export function AppSidebar() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { state } = useSidebar();
  const { data: updateCheck } = useCliproxyUpdateCheck();
  const navGroups = buildNavGroups(t);

  // Dynamic label for CLIProxy based on backend
  const cliproxyLabel = updateCheck?.backendLabel ?? 'CLIProxy';

  // Helper to get dynamic label (for CLIProxy route)
  const getItemLabel = (item: { path: string; label: string }) => {
    if (item.path === '/cliproxy') {
      return cliproxyLabel;
    }
    return item.label;
  };

  // Helper to check if a route is active (exact match)
  const isRouteActive = (path: string) => location.pathname === path;

  // Helper to check if a group/parent should be open based on active child
  // Also handles sub-routes (e.g., /cliproxy/control-panel matches /cliproxy)
  const isParentActive = (children: { path: string }[]) => {
    return children.some(
      (child) => isRouteActive(child.path) || location.pathname.startsWith(child.path + '/')
    );
  };

  const getPrimaryRoute = (item: SidebarItem) => {
    if (item.path === '/accounts') {
      return '/shared';
    }
    return item.path;
  };

  const renderMenuIcon = (item: Pick<SidebarItem, 'icon' | 'iconSrc'>) => {
    if (item.iconSrc) {
      return <img src={item.iconSrc} alt="" className="w-4 h-4 object-contain" />;
    }
    if (item.icon) {
      const Icon = item.icon;
      return <Icon className="w-4 h-4" />;
    }
    return null;
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-12 flex items-center justify-center">
        <CcsLogo size="sm" showText={state === 'expanded'} />
      </SidebarHeader>

      <SidebarContent>
        {navGroups.map((group, index) => (
          <SidebarGroup key={group.title || index}>
            {group.title && <SidebarGroupLabel>{group.title}</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.path}>
                    {item.isCollapsible && item.children ? (
                      <Collapsible
                        defaultOpen={isParentActive(item.children) || isRouteActive(item.path)}
                        className="group/collapsible"
                      >
                        {/* Click navigates to overview AND opens submenu */}
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton
                            tooltip={getItemLabel(item)}
                            isActive={isParentActive(item.children)}
                            onClick={() => navigate(getPrimaryRoute(item))}
                          >
                            {renderMenuIcon(item)}
                            <span className="group-data-[collapsible=icon]:hidden">
                              {getItemLabel(item)}
                            </span>
                            <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90 group-data-[collapsible=icon]:hidden" />
                          </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <SidebarMenuSub>
                            {item.children.map((child) => (
                              <SidebarMenuSubItem key={child.path}>
                                <SidebarMenuSubButton asChild isActive={isRouteActive(child.path)}>
                                  <Link to={child.path}>
                                    <span>{child.label}</span>
                                  </Link>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            ))}
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </Collapsible>
                    ) : (
                      <SidebarMenuButton
                        asChild
                        isActive={isRouteActive(item.path)}
                        tooltip={getItemLabel(item)}
                      >
                        <Link to={item.path}>
                          {renderMenuIcon(item)}
                          <span className="group-data-[collapsible=icon]:hidden flex-1">
                            {getItemLabel(item)}
                          </span>
                          {item.badge && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span
                                  className={cn(
                                    'group-data-[collapsible=icon]:hidden ml-auto flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded transition-colors',
                                    isRouteActive(item.path)
                                      ? 'bg-white/92 border border-white/65 shadow-sm'
                                      : 'bg-accent/15 text-accent border border-accent/30 group-hover/menu-item:bg-sidebar-accent-foreground/20 group-hover/menu-item:text-sidebar-accent-foreground group-hover/menu-item:border-sidebar-accent-foreground/30'
                                  )}
                                >
                                  {(item.badge.icons && item.badge.icons.length > 0
                                    ? item.badge.icons
                                    : item.badge.icon
                                      ? [item.badge.icon]
                                      : []
                                  ).map((iconPath) => (
                                    <span
                                      key={iconPath}
                                      className={cn(
                                        'inline-flex h-4 w-4 items-center justify-center rounded-[3px] border',
                                        isRouteActive(item.path)
                                          ? 'bg-white border-black/10'
                                          : 'bg-background/80 border-border/40 group-hover/menu-item:bg-white/90'
                                      )}
                                    >
                                      <img
                                        src={iconPath}
                                        alt=""
                                        className="h-3 w-3 object-contain"
                                      />
                                    </span>
                                  ))}
                                  {item.badge.text && (
                                    <span className="hidden sm:inline">{item.badge.text}</span>
                                  )}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="right">
                                <p>{t('nav.openrouterTooltip')}</p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </Link>
                      </SidebarMenuButton>
                    )}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="p-4 border-t flex items-center justify-center">
        <SidebarTrigger />
      </SidebarFooter>
    </Sidebar>
  );
}
