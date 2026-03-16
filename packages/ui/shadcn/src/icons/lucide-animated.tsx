"use client";

import type { LucideProps } from "lucide-react";
import {
  Archive as LucideArchive,
  ArrowLeft as LucideArrowLeft,
  ArrowRight as LucideArrowRight,
  BarChart3 as LucideBarChart3,
  Check as LucideCheck,
  ChevronLeft as LucideChevronLeft,
  CircleAlert as LucideCircleAlert,
  CircleHelp as LucideCircleHelp,
  CreditCard as LucideCreditCard,
  Database as LucideDatabase,
  ExternalLink as LucideExternalLink,
  File as LucideFile,
  FileText as LucideFileText,
  Gauge as LucideGauge,
  Globe as LucideGlobe,
  History as LucideHistory,
  Image as LucideImage,
  Keyboard as LucideKeyboard,
  LayoutGrid as LucideLayoutGrid,
  List as LucideList,
  LogIn as LucideLogIn,
  LogOut as LucideLogOut,
  Menu as LucideMenu,
  Monitor as LucideMonitor,
  Navigation2 as LucideNavigation2,
  PanelLeftIcon as LucidePanelLeftIcon,
  PanelsTopLeft as LucidePanelsTopLeft,
  Pin as LucidePin,
  PinOff as LucidePinOff,
  Plus as LucidePlus,
  Puzzle as LucidePuzzle,
  Receipt as LucideReceipt,
  Search as LucideSearch,
  Settings2 as LucideSettings2,
  Shield as LucideShield,
  ShieldCheck as LucideShieldCheck,
  ShieldX as LucideShieldX,
  SlidersHorizontal as LucideSlidersHorizontal,
  Star as LucideStar,
  Trash2 as LucideTrash2,
  Undo2 as LucideUndo2,
  UserCog as LucideUserCog,
  UserPlus as LucideUserPlus,
  UserRound as LucideUserRound,
  Users as LucideUsers,
  Waves as LucideWaves,
  Workflow as LucideWorkflow,
  Wrench as LucideWrench,
  X as LucideX,
} from "lucide-react";

import BellIcon from "./bell-icon";
import ChevronDownIcon from "./chevron-down";
import ChevronRightIcon from "./chevron-right";
import LanguagesIcon from "./languages-icon";
import {
  createAnimatedLucideIcon,
  type AnimatedLucideProps,
  type LucideIcon,
} from "./lucide-animated-factory";
import MoonIcon from "./moon-icon";
import SunIcon from "./sun-icon";

export type { AnimatedLucideProps, LucideIcon, LucideProps };

export const Bell = BellIcon as LucideIcon;
export const ChevronDown = ChevronDownIcon as LucideIcon;
export const ChevronRight = ChevronRightIcon as LucideIcon;
export const Languages = LanguagesIcon as LucideIcon;
export const Moon = MoonIcon as LucideIcon;
export const Sun = SunIcon as LucideIcon;

export const Archive = createAnimatedLucideIcon(LucideArchive, "lift");
export const ArrowLeft = createAnimatedLucideIcon(LucideArrowLeft, "nudge-left");
export const ArrowRight = createAnimatedLucideIcon(LucideArrowRight, "nudge-right");
export const BarChart3 = createAnimatedLucideIcon(LucideBarChart3, "lift");
export const Check = createAnimatedLucideIcon(LucideCheck, "pulse");
export const ChevronLeft = createAnimatedLucideIcon(LucideChevronLeft, "nudge-left");
export const CircleAlert = createAnimatedLucideIcon(LucideCircleAlert, "wiggle");
export const CircleHelp = createAnimatedLucideIcon(LucideCircleHelp, "wiggle");
export const CreditCard = createAnimatedLucideIcon(LucideCreditCard, "lift");
export const Database = createAnimatedLucideIcon(LucideDatabase, "lift");
export const ExternalLink = createAnimatedLucideIcon(LucideExternalLink, "nudge-right");
export const File = createAnimatedLucideIcon(LucideFile, "lift");
export const FileText = createAnimatedLucideIcon(LucideFileText, "lift");
export const Gauge = createAnimatedLucideIcon(LucideGauge, "lift");
export const Globe = createAnimatedLucideIcon(LucideGlobe, "lift");
export const History = createAnimatedLucideIcon(LucideHistory, "lift");
export const Image = createAnimatedLucideIcon(LucideImage, "lift");
export const Keyboard = createAnimatedLucideIcon(LucideKeyboard, "lift");
export const LayoutGrid = createAnimatedLucideIcon(LucideLayoutGrid, "lift");
export const List = createAnimatedLucideIcon(LucideList, "lift");
export const LogIn = createAnimatedLucideIcon(LucideLogIn, "nudge-right");
export const LogOut = createAnimatedLucideIcon(LucideLogOut, "nudge-left");
export const Menu = createAnimatedLucideIcon(LucideMenu, "wiggle");
export const Monitor = createAnimatedLucideIcon(LucideMonitor, "pulse");
export const Navigation2 = createAnimatedLucideIcon(LucideNavigation2, "nudge-right");
export const PanelLeftIcon = createAnimatedLucideIcon(LucidePanelLeftIcon, "nudge-left");
export const PanelsTopLeft = createAnimatedLucideIcon(LucidePanelsTopLeft, "lift");
export const Pin = createAnimatedLucideIcon(LucidePin, "pop");
export const PinOff = createAnimatedLucideIcon(LucidePinOff, "nudge-left");
export const Plus = createAnimatedLucideIcon(LucidePlus, "pop");
export const Puzzle = createAnimatedLucideIcon(LucidePuzzle, "lift");
export const Receipt = createAnimatedLucideIcon(LucideReceipt, "lift");
export const Search = createAnimatedLucideIcon(LucideSearch, "nudge-right");
export const Settings2 = createAnimatedLucideIcon(LucideSettings2, "spin");
export const Shield = createAnimatedLucideIcon(LucideShield, "pulse");
export const ShieldCheck = createAnimatedLucideIcon(LucideShieldCheck, "pulse");
export const ShieldX = createAnimatedLucideIcon(LucideShieldX, "wiggle");
export const SlidersHorizontal = createAnimatedLucideIcon(LucideSlidersHorizontal, "lift");
export const Star = createAnimatedLucideIcon(LucideStar, "pulse");
export const Trash2 = createAnimatedLucideIcon(LucideTrash2, "wiggle");
export const Undo2 = createAnimatedLucideIcon(LucideUndo2, "nudge-left");
export const UserCog = createAnimatedLucideIcon(LucideUserCog, "lift");
export const UserPlus = createAnimatedLucideIcon(LucideUserPlus, "pop");
export const UserRound = createAnimatedLucideIcon(LucideUserRound, "lift");
export const Users = createAnimatedLucideIcon(LucideUsers, "lift");
export const Waves = createAnimatedLucideIcon(LucideWaves, "lift");
export const Workflow = createAnimatedLucideIcon(LucideWorkflow, "lift");
export const Wrench = createAnimatedLucideIcon(LucideWrench, "wiggle");
export const X = createAnimatedLucideIcon(LucideX, "wiggle");
