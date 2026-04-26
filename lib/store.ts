// 로컬 JSON 파일 저장소
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import type { Analysis, CategoriesFile, Category, TodosFile } from "./types";

const DATA_DIR = path.join(os.homedir(), ".kakaocli");
const CATEGORIES_PATH = path.join(DATA_DIR, "categories.json");
const TODOS_PATH = path.join(DATA_DIR, "todos.json");

async function ensureDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch {
    // ignore
  }
}

async function readJson<T>(p: string, fallback: T): Promise<T> {
  try {
    await ensureDir();
    const raw = await fs.readFile(p, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(p: string, data: unknown): Promise<void> {
  await ensureDir();
  await fs.writeFile(p, JSON.stringify(data, null, 2), "utf-8");
}

export async function getCategories(): Promise<CategoriesFile> {
  return readJson<CategoriesFile>(CATEGORIES_PATH, {});
}

export async function setCategory(
  chatId: string,
  category: Category | null,
): Promise<void> {
  const data = await getCategories();
  if (category === null) {
    delete data[chatId];
  } else {
    data[chatId] = category;
  }
  await writeJson(CATEGORIES_PATH, data);
}

export async function getTodos(): Promise<TodosFile> {
  return readJson<TodosFile>(TODOS_PATH, {});
}

export async function getTodoForChat(
  chatId: string,
): Promise<Analysis | null> {
  const data = await getTodos();
  return data[chatId] ?? null;
}

export async function setTodoForChat(
  chatId: string,
  analysis: Analysis,
): Promise<void> {
  const data = await getTodos();
  data[chatId] = analysis;
  await writeJson(TODOS_PATH, data);
}
