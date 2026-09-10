/**
 * Curated icon set for task lists and notebooks (Stage 6).
 * Keys are stored in the DB (`task_lists.icon` / `notebooks.icon`); defaults
 * ("inbox", "list", "book-open", etc.) are included for back-compat.
 */
import {
  Inbox,
  ListTodo,
  Briefcase,
  Heart,
  ShoppingBag,
  Sun,
  Star,
  Home,
  Flag,
  CalendarDays,
  Music,
  Camera,
  Plane,
  Dumbbell,
  GraduationCap,
  Coffee,
  Zap,
  BookOpen,
  Layers,
  Lightbulb,
  Folder,
  NotebookPen,
  type LucideIcon,
} from "lucide-react";

export const LIST_ICONS: Record<string, LucideIcon> = {
  inbox: Inbox,
  list: ListTodo,
  briefcase: Briefcase,
  heart: Heart,
  "shopping-bag": ShoppingBag,
  sun: Sun,
  star: Star,
  home: Home,
  flag: Flag,
  calendar: CalendarDays,
  music: Music,
  camera: Camera,
  plane: Plane,
  dumbbell: Dumbbell,
  graduation: GraduationCap,
  coffee: Coffee,
  zap: Zap,
  book: BookOpen,
  "book-open": BookOpen,
  layers: Layers,
  lightbulb: Lightbulb,
  folder: Folder,
};

export function listIcon(name: string): LucideIcon {
  return LIST_ICONS[name] ?? ListTodo;
}

/** Union set shown in the picker (deduped, stable order). */
export const ICON_CHOICES: { key: string; icon: LucideIcon; label: string }[] = [
  { key: "list", icon: ListTodo, label: "List" },
  { key: "inbox", icon: Inbox, label: "Inbox" },
  { key: "briefcase", icon: Briefcase, label: "Work" },
  { key: "heart", icon: Heart, label: "Personal" },
  { key: "home", icon: Home, label: "Home" },
  { key: "star", icon: Star, label: "Star" },
  { key: "flag", icon: Flag, label: "Flag" },
  { key: "calendar", icon: CalendarDays, label: "Calendar" },
  { key: "shopping-bag", icon: ShoppingBag, label: "Shopping" },
  { key: "sun", icon: Sun, label: "Morning" },
  { key: "zap", icon: Zap, label: "Energy" },
  { key: "music", icon: Music, label: "Music" },
  { key: "camera", icon: Camera, label: "Photos" },
  { key: "plane", icon: Plane, label: "Travel" },
  { key: "dumbbell", icon: Dumbbell, label: "Fitness" },
  { key: "graduation", icon: GraduationCap, label: "Study" },
  { key: "coffee", icon: Coffee, label: "Coffee" },
  { key: "folder", icon: Folder, label: "Projects" },
  { key: "layers", icon: Layers, label: "Layers" },
  { key: "lightbulb", icon: Lightbulb, label: "Ideas" },
  { key: "book-open", icon: BookOpen, label: "Notebook" },
];
