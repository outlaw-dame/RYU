import type { Icon } from "@phosphor-icons/react";
import { Pulse } from "@phosphor-icons/react/dist/csr/Pulse";
import { Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { CaretLeft } from "@phosphor-icons/react/dist/csr/CaretLeft";
import { Book } from "@phosphor-icons/react/dist/csr/Book";
import { Bookmark } from "@phosphor-icons/react/dist/csr/Bookmark";
import { Check } from "@phosphor-icons/react/dist/csr/Check";
import { X } from "@phosphor-icons/react/dist/csr/X";
import { NotePencil } from "@phosphor-icons/react/dist/csr/NotePencil";
import { Compass } from "@phosphor-icons/react/dist/csr/Compass";
import { ArrowSquareOut } from "@phosphor-icons/react/dist/csr/ArrowSquareOut";
import { Heart } from "@phosphor-icons/react/dist/csr/Heart";
import { House } from "@phosphor-icons/react/dist/csr/House";
import { Books } from "@phosphor-icons/react/dist/csr/Books";
import { DotsThree } from "@phosphor-icons/react/dist/csr/DotsThree";
import { Bell } from "@phosphor-icons/react/dist/csr/Bell";
import { User } from "@phosphor-icons/react/dist/csr/User";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import { Gear } from "@phosphor-icons/react/dist/csr/Gear";
import { Export } from "@phosphor-icons/react/dist/csr/Export";
import { Folder } from "@phosphor-icons/react/dist/csr/Folder";
import { Star } from "@phosphor-icons/react/dist/csr/Star";
import { ArrowsCounterClockwise } from "@phosphor-icons/react/dist/csr/ArrowsCounterClockwise";
import { Warning } from "@phosphor-icons/react/dist/csr/Warning";
import { SquaresFour } from "@phosphor-icons/react/dist/csr/SquaresFour";
import type { AppIconName } from "./iconTypes";

export type { AppIconName } from "./iconTypes";

export type IconComponent = Icon;

export const iconMap: Record<AppIconName, IconComponent> = {
  activity: Pulse,
  add: Plus,
  back: CaretLeft,
  book: Book,
  bookmark: Bookmark,
  check: Check,
  close: X,
  compose: NotePencil,
  discover: Compass,
  external: ArrowSquareOut,
  heart: Heart,
  home: House,
  library: Books,
  more: DotsThree,
  notification: Bell,
  profile: User,
  search: MagnifyingGlass,
  settings: Gear,
  share: Export,
  shelf: Folder,
  star: Star,
  sync: ArrowsCounterClockwise,
  warning: Warning,
  grid: SquaresFour,
  user: User
};
