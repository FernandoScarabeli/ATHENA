import {
  ChevronRight,
  ArrowLeft,
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
  Users,
  X,
  type LucideIcon,
  type LucideProps,
} from 'lucide-react';

type IconName = 'branch' | 'map' | 'list' | 'plus' | 'search' | 'logout' | 'close' | 'link' | 'user' | 'users' | 'chevron' | 'back' | 'filter' | 'refresh' | 'folder' | 'settings' | 'bell' | 'check' | 'message';

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
  users: Users,
  chevron: ChevronRight,
  back: ArrowLeft,
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
