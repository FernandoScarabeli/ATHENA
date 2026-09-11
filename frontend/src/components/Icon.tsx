import {
  ChevronRight,
  Folder,
  Filter,
  GitBranch,
  Link,
  List,
  LogOut,
  Map,
  Plus,
  RefreshCcw,
  Search,
  Settings,
  Bell,
  Check,
  MessageCircle,
  User,
  X,
  type LucideIcon,
  type LucideProps,
} from 'lucide-react';

type IconName = 'branch' | 'map' | 'list' | 'plus' | 'search' | 'logout' | 'close' | 'link' | 'user' | 'chevron' | 'filter' | 'refresh' | 'folder' | 'settings' | 'bell' | 'check' | 'message';

const icons: Record<IconName, LucideIcon> = {
  branch: GitBranch,
  map: Map,
  list: List,
  plus: Plus,
  search: Search,
  logout: LogOut,
  close: X,
  link: Link,
  user: User,
  chevron: ChevronRight,
  folder: Folder,
  settings: Settings,
  bell: Bell,
  check: Check,
  message: MessageCircle,
  filter: Filter,
  refresh: RefreshCcw,
};

export function Icon({ name, size = 16, ...props }: LucideProps & { name: IconName; size?: number }) {
  const Component = icons[name];
  return <Component aria-hidden="true" size={size} strokeWidth={1.8} {...props}/>;
}
