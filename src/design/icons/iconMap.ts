import type { ComponentType } from "react";
import { PulseIcon } from "@phosphor-icons/react/dist/csr/Pulse";
import { PlusIcon } from "@phosphor-icons/react/dist/csr/Plus";
import { CaretLeftIcon } from "@phosphor-icons/react/dist/csr/CaretLeft";
import { BookIcon } from "@phosphor-icons/react/dist/csr/Book";
import { BookmarkIcon } from "@phosphor-icons/react/dist/csr/Bookmark";
import { CheckIcon } from "@phosphor-icons/react/dist/csr/Check";
import { XIcon } from "@phosphor-icons/react/dist/csr/X";
import { NotePencilIcon } from "@phosphor-icons/react/dist/csr/NotePencil";
import { CompassIcon } from "@phosphor-icons/react/dist/csr/Compass";
import { ArrowSquareOutIcon } from "@phosphor-icons/react/dist/csr/ArrowSquareOut";
import { HeartIcon } from "@phosphor-icons/react/dist/csr/Heart";
import { HouseIcon } from "@phosphor-icons/react/dist/csr/House";
import { BooksIcon } from "@phosphor-icons/react/dist/csr/Books";
import { DotsThreeIcon } from "@phosphor-icons/react/dist/csr/DotsThree";
import { BellIcon } from "@phosphor-icons/react/dist/csr/Bell";
import { UserIcon } from "@phosphor-icons/react/dist/csr/User";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import { GearIcon } from "@phosphor-icons/react/dist/csr/Gear";
import { ExportIcon } from "@phosphor-icons/react/dist/csr/Export";
import { FolderIcon } from "@phosphor-icons/react/dist/csr/Folder";
import { StarIcon } from "@phosphor-icons/react/dist/csr/Star";
import { ArrowsCounterClockwiseIcon } from "@phosphor-icons/react/dist/csr/ArrowsCounterClockwise";
import { WarningIcon } from "@phosphor-icons/react/dist/csr/Warning";
import { SquaresFourIcon } from "@phosphor-icons/react/dist/csr/SquaresFour";
import type { AppIconName } from "./iconTypes";

export type { AppIconName } from "./iconTypes";

export type IconComponent = ComponentType<any>;

export const iconMap: Record<AppIconName, IconComponent> = {
  activity: PulseIcon,
  add: PlusIcon,
  back: CaretLeftIcon,
  book: BookIcon,
  bookmark: BookmarkIcon,
  check: CheckIcon,
  close: XIcon,
  compose: NotePencilIcon,
  discover: CompassIcon,
  external: ArrowSquareOutIcon,
  heart: HeartIcon,
  home: HouseIcon,
  library: BooksIcon,
  more: DotsThreeIcon,
  notification: BellIcon,
  profile: UserIcon,
  search: MagnifyingGlassIcon,
  settings: GearIcon,
  share: ExportIcon,
  shelf: FolderIcon,
  star: StarIcon,
  sync: ArrowsCounterClockwiseIcon,
  warning: WarningIcon,
  grid: SquaresFourIcon,
  user: UserIcon
};
