/**
 * Icon mapping for RYU
 * Centralizes icon library usage behind semantic names.
 * Currently uses Iconoir — swappable without touching consuming code.
 */

import type { ComponentType, SVGProps } from "react";
import {
  Book,
  Search,
  Settings,
  User,
  Home,
  BookStack,
  Plus,
  Edit,
  Trash,
  ShareIos,
  Heart,
  Star,
  Bookmark,
  MoreHoriz,
  NavArrowLeft,
  NavArrowRight,
  Menu,
  Xmark,
  Refresh,
  Download,
  Upload,
  Filter,
  Sort,
  ViewGrid,
  List,
  HalfMoon,
  SunLight,
  Bell,
  ChatBubble,
  Activity,
  Label,
  Hashtag,
  Link,
  OpenNewWindow,
  Copy,
  Check,
  WarningTriangle,
  InfoCircle,
  WarningCircle,
  CheckCircle,
  Calendar,
  Clock,
  UserCircle,
  Group,
  Community,
  Globe,
  Language,
  Translate,
  RefreshDouble,
  Wifi,
  WifiOff,
  BatteryFull,
  Emoji,
  MediaImage,
  Camera,
  MediaImageList,
  Folder,
  Database,
  Server,
  Barcode,
  QrCode,
  ScanBarcode
} from "iconoir-react";

/** SVG icon component type accepted by the icon map */
export type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

// Semantic icon names for RYU
export type AppIconName =
  | "book"
  | "search"
  | "settings"
  | "user"
  | "home"
  | "library"
  | "add"
  | "edit"
  | "delete"
  | "share"
  | "heart"
  | "star"
  | "bookmark"
  | "more"
  | "back"
  | "forward"
  | "menu"
  | "close"
  | "refresh"
  | "download"
  | "upload"
  | "filter"
  | "sort"
  | "grid"
  | "list"
  | "dark-mode"
  | "light-mode"
  | "notification"
  | "message"
  | "activity"
  | "tag"
  | "hashtag"
  | "link"
  | "external-link"
  | "copy"
  | "check"
  | "error"
  | "warning"
  | "info"
  | "success"
  | "calendar"
  | "clock"
  | "user-circle"
  | "users"
  | "community"
  | "globe"
  | "language"
  | "translation"
  | "sync"
  | "wifi"
  | "wifi-off"
  | "battery"
  | "emoji"
  | "image"
  | "camera"
  | "gallery"
  | "folder"
  | "database"
  | "server"
  | "barcode"
  | "qrcode"
  | "scan";

// Icon mapping: semantic name -> Iconoir component
const iconMap: Record<AppIconName, IconComponent> = {
  "book": Book as IconComponent,
  "search": Search as IconComponent,
  "settings": Settings as IconComponent,
  "user": User as IconComponent,
  "home": Home as IconComponent,
  "library": BookStack as IconComponent,
  "add": Plus as IconComponent,
  "edit": Edit as IconComponent,
  "delete": Trash as IconComponent,
  "share": ShareIos as IconComponent,
  "heart": Heart as IconComponent,
  "star": Star as IconComponent,
  "bookmark": Bookmark as IconComponent,
  "more": MoreHoriz as IconComponent,
  "back": NavArrowLeft as IconComponent,
  "forward": NavArrowRight as IconComponent,
  "menu": Menu as IconComponent,
  "close": Xmark as IconComponent,
  "refresh": Refresh as IconComponent,
  "download": Download as IconComponent,
  "upload": Upload as IconComponent,
  "filter": Filter as IconComponent,
  "sort": Sort as IconComponent,
  "grid": ViewGrid as IconComponent,
  "list": List as IconComponent,
  "dark-mode": HalfMoon as IconComponent,
  "light-mode": SunLight as IconComponent,
  "notification": Bell as IconComponent,
  "message": ChatBubble as IconComponent,
  "activity": Activity as IconComponent,
  "tag": Label as IconComponent,
  "hashtag": Hashtag as IconComponent,
  "link": Link as IconComponent,
  "external-link": OpenNewWindow as IconComponent,
  "copy": Copy as IconComponent,
  "check": Check as IconComponent,
  "error": WarningCircle as IconComponent,
  "warning": WarningTriangle as IconComponent,
  "info": InfoCircle as IconComponent,
  "success": CheckCircle as IconComponent,
  "calendar": Calendar as IconComponent,
  "clock": Clock as IconComponent,
  "user-circle": UserCircle as IconComponent,
  "users": Group as IconComponent,
  "community": Community as IconComponent,
  "globe": Globe as IconComponent,
  "language": Language as IconComponent,
  "translation": Translate as IconComponent,
  "sync": RefreshDouble as IconComponent,
  "wifi": Wifi as IconComponent,
  "wifi-off": WifiOff as IconComponent,
  "battery": BatteryFull as IconComponent,
  "emoji": Emoji as IconComponent,
  "image": MediaImage as IconComponent,
  "camera": Camera as IconComponent,
  "gallery": MediaImageList as IconComponent,
  "folder": Folder as IconComponent,
  "database": Database as IconComponent,
  "server": Server as IconComponent,
  "barcode": Barcode as IconComponent,
  "qrcode": QrCode as IconComponent,
  "scan": ScanBarcode as IconComponent
};

export function getIconComponent(name: AppIconName): IconComponent {
  return iconMap[name];
}

export function getAllIconNames(): AppIconName[] {
  return Object.keys(iconMap) as AppIconName[];
}

export { iconMap };
