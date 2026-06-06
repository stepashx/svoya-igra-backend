/**
 * Required static seed datasets (Stage 5A.6).
 *
 * These are the MVP "tier 1" seeds — without them the game cannot run. The data
 * here is pure, deterministic, and storage-agnostic: every row carries a stable,
 * hand-assigned UUID so re-seeding is idempotent (upsert on the primary key) and
 * cross-references between datasets (questions → categories, shop items → QR
 * tools) are fixed and reviewable rather than random.
 *
 * What is intentionally NOT here:
 *   - Runtime tables (rooms/players/teams/board_cells/purchases/inventory/
 *     submissions/scores/results) — never seeded in normal operation.
 *   - QR `.svg` bytes or MinIO placement — this stage seeds metadata only; the
 *     storage fields (provider/bucket/storageKey/publicUrl) are composed by the
 *     runner from config, and uploading objects is a later sub-stage (5A.7).
 *   - Demo/runtime convenience data.
 *
 * Content language is Russian to match the player-facing game ("Своя игра"); the
 * exact wording is authored here (the planning docs fix the structure — 6
 * categories, 30 questions five-per-category at 100/200/400/600/800, two
 * evaluation criteria — but not the literal strings). See the seed README.
 */
import type { InferInsertModel } from 'drizzle-orm';
import {
  categories,
  evaluationCriteria,
  presentationRequirements,
  presentationTopics,
  questions,
} from '../schema';

/**
 * Build a stable, valid v4-shaped UUID from a hex group label + an index, so the
 * seed ids are deterministic and unique per dataset without a uuid dependency.
 * `group` must contain only hex characters.
 */
function seedId(group: string, index: number): string {
  const head = group.padEnd(8, '0').slice(0, 8);
  const tail = index.toString(16).padStart(12, '0');
  return `${head}-0000-4000-8000-${tail}`;
}

/** The five board point values, in ascending order (also the in-category order). */
export const QUESTION_POINT_VALUES = [100, 200, 400, 600, 800] as const;

// --- Categories (exactly 6) ---------------------------------------------------

type CategorySeed = InferInsertModel<typeof categories>;

/** Stable category ids, referenced by the question dataset. */
export const CATEGORY_IDS = {
  idea: seedId('ca7e', 1),
  audience: seedId('ca7e', 2),
  structure: seedId('ca7e', 3),
  design: seedId('ca7e', 4),
  speaking: seedId('ca7e', 5),
  defense: seedId('ca7e', 6),
} as const;

export const CATEGORY_SEEDS: CategorySeed[] = [
  { id: CATEGORY_IDS.idea, title: 'Идея и проблема', position: 1 },
  { id: CATEGORY_IDS.audience, title: 'Аудитория и рынок', position: 2 },
  { id: CATEGORY_IDS.structure, title: 'Структура презентации', position: 3 },
  { id: CATEGORY_IDS.design, title: 'Дизайн и визуал', position: 4 },
  { id: CATEGORY_IDS.speaking, title: 'Публичное выступление', position: 5 },
  { id: CATEGORY_IDS.defense, title: 'Защита и вопросы', position: 6 },
];

// --- Questions (exactly 30 — five per category by value) ----------------------

type QuestionSeed = InferInsertModel<typeof questions>;

/**
 * Per-category question content, ordered by ascending point value. Each tuple is
 * [text, correctAnswer]; the value/position/id are derived so the five-per-
 * category board shape is guaranteed by construction.
 */
const QUESTION_CONTENT: Record<
  keyof typeof CATEGORY_IDS,
  [text: string, correctAnswer: string][]
> = {
  idea: [
    [
      'Как одним предложением называют ключевую проблему, которую решает проект?',
      'Проблемное утверждение (problem statement)',
    ],
    [
      'Краткая ёмкая формулировка пользы продукта для пользователя — это …?',
      'Ценностное предложение (value proposition)',
    ],
    ['Метод «5 почему» помогает найти что?', 'Корневую причину проблемы'],
    [
      'Как называется минимально жизнеспособная версия продукта для проверки идеи?',
      'MVP (минимально жизнеспособный продукт)',
    ],
    [
      'Каким методом проверяют гипотезу о том, кто и почему купит продукт?',
      'Customer Development (развитие клиентов)',
    ],
  ],
  audience: [
    [
      'Собирательный образ типичного пользователя продукта называется …?',
      'Персона (portrait/persona)',
    ],
    [
      'Как расшифровывается аббревиатура TAM при оценке объёма рынка?',
      'Total Addressable Market',
    ],
    [
      'Как называется анализ сильных и слабых сторон, возможностей и угроз?',
      'SWOT-анализ',
    ],
    [
      'В каком анализе изучают прямых конкурентов и продукты-заменители?',
      'Конкурентный анализ',
    ],
    [
      'Как сокращённо называют стоимость привлечения одного клиента?',
      'CAC (Customer Acquisition Cost)',
    ],
  ],
  structure: [
    [
      'С какого слайда обычно начинается презентация проекта?',
      'Титульный слайд',
    ],
    [
      'Слайд, кратко описывающий суть проекта за 30 секунд, называют …?',
      'Лифтовая презентация (elevator pitch)',
    ],
    [
      'До скольких слайдов ограничивает презентацию правило «10/20/30» Гая Кавасаки?',
      '10 слайдов',
    ],
    [
      'Как называется приём, когда презентацию строят как историю?',
      'Сторителлинг',
    ],
    [
      'Каким слайдом принято завершать презентацию проекта?',
      'Слайд с призывом к действию (контакты/CTA)',
    ],
  ],
  design: [
    [
      'Сколько основных цветов рекомендуется использовать в оформлении слайда?',
      'Два-три цвета',
    ],
    [
      'Как называется принцип, требующий свободного пространства на слайде?',
      'Воздух (негативное пространство)',
    ],
    [
      'Шрифты делятся на две группы: с засечками и …?',
      'Без засечек (sans-serif)',
    ],
    ['Какая диаграмма показывает доли целого?', 'Круговая диаграмма'],
    [
      'Как называется принцип дизайна, группирующий связанные элементы рядом?',
      'Принцип близости',
    ],
  ],
  speaking: [
    ['Как называется страх публичных выступлений?', 'Глоссофобия'],
    [
      'Какое невербальное средство усиливает контакт с залом?',
      'Зрительный контакт',
    ],
    [
      'Каков оптимальный темп речи для выступления в словах в минуту?',
      '100–130 слов в минуту',
    ],
    [
      'Как называется короткая пауза перед важной мыслью?',
      'Драматическая пауза',
    ],
    [
      'Что повышает репетиция речи вслух перед выступлением?',
      'Уверенность и плавность речи',
    ],
  ],
  defense: [
    [
      'Как называется часть защиты, где жюри задаёт вопросы?',
      'Сессия вопросов и ответов (Q&A)',
    ],
    [
      'Что стоит сделать, если не знаешь ответа на вопрос жюри?',
      'Честно признать и предложить уточнить позже',
    ],
    [
      'Как называют заранее заготовленные ответы на ожидаемые вопросы?',
      'Q&A-подготовка / бэкап-слайды',
    ],
    [
      'Как называется умение спокойно реагировать на критику?',
      'Стрессоустойчивость',
    ],
    [
      'Как называется финальный аргумент, закрепляющий ценность проекта?',
      'Заключительный тезис (closing statement)',
    ],
  ],
};

export const QUESTION_SEEDS: QuestionSeed[] = (
  Object.keys(CATEGORY_IDS) as (keyof typeof CATEGORY_IDS)[]
).flatMap((key, categoryIndex) =>
  QUESTION_CONTENT[key].map(([text, correctAnswer], valueIndex) => ({
    id: seedId('ae57', (categoryIndex + 1) * 10 + (valueIndex + 1)),
    categoryId: CATEGORY_IDS[key],
    text,
    correctAnswer,
    points: QUESTION_POINT_VALUES[valueIndex],
    position: valueIndex + 1,
  })),
);

// --- Presentation topics (global catalog; ≥ supported team count) -------------

type PresentationTopicSeed = InferInsertModel<typeof presentationTopics>;

export const PRESENTATION_TOPIC_SEEDS: PresentationTopicSeed[] = [
  {
    id: seedId('b01c', 1),
    title: 'Мобильное приложение для учёбы',
    description: 'Сервис, помогающий школьникам и студентам планировать учёбу.',
  },
  {
    id: seedId('b01c', 2),
    title: 'Экологический стартап',
    description: 'Проект, снижающий вред для окружающей среды.',
  },
  {
    id: seedId('b01c', 3),
    title: 'Платформа для волонтёров',
    description: 'Сервис, связывающий волонтёров и организации.',
  },
  {
    id: seedId('b01c', 4),
    title: 'Умный дом',
    description: 'Решение для автоматизации бытовых устройств.',
  },
  {
    id: seedId('b01c', 5),
    title: 'Сервис доставки еды',
    description: 'Платформа доставки от локальных кафе и магазинов.',
  },
  {
    id: seedId('b01c', 6),
    title: 'Образовательная онлайн-игра',
    description: 'Игровой сервис для обучения в интерактивной форме.',
  },
  {
    id: seedId('b01c', 7),
    title: 'Маркетплейс хендмейда',
    description: 'Площадка для продажи изделий ручной работы.',
  },
  {
    id: seedId('b01c', 8),
    title: 'Финтех для подростков',
    description: 'Приложение для финансовой грамотности молодёжи.',
  },
];

// --- QR tools (metadata only; storage fields composed by the runner) ----------

/**
 * The intrinsic, storage-agnostic fields of a QR tool. The runner adds
 * `fileFormat`/`storageProvider`/`bucket`/`storageKey`/`publicUrl` from config —
 * this stage seeds metadata only and never uploads the `.svg` bytes.
 */
export interface QrToolSeed {
  id: string;
  title: string;
  description: string;
  payload: string | null;
}

export const QR_TOOL_SEEDS: QrToolSeed[] = [
  {
    id: seedId('a4e0', 1),
    title: 'Подсказка 50/50',
    description: 'Убирает часть неверных вариантов ответа.',
    payload: 'fifty-fifty',
  },
  {
    id: seedId('a4e0', 2),
    title: 'Дополнительная минута',
    description: 'Продлевает таймер ответа на одну минуту.',
    payload: 'extra-minute',
  },
  {
    id: seedId('a4e0', 3),
    title: 'Право на ошибку',
    description: 'Не блокирует ячейку при первом неверном ответе.',
    payload: 'second-chance',
  },
  {
    id: seedId('a4e0', 4),
    title: 'Двойные очки',
    description: 'Удваивает очки за следующий верный ответ.',
    payload: 'double-points',
  },
  {
    id: seedId('a4e0', 5),
    title: 'Помощь зала',
    description: 'Показывает распределение мнений по вариантам.',
    payload: 'audience-help',
  },
  {
    id: seedId('a4e0', 6),
    title: 'Шаблон слайда',
    description: 'Готовый шаблон для оформления презентации.',
    payload: 'slide-template',
  },
];

// --- Shop items (each wraps one QR tool; price > 0) ---------------------------

/** A buyable item wrapping a QR tool. `qrToolId` references a QR_TOOL_SEEDS id. */
export interface ShopItemSeed {
  id: string;
  title: string;
  description: string;
  price: number;
  qrToolId: string;
}

export const SHOP_ITEM_SEEDS: ShopItemSeed[] = [
  {
    id: seedId('5009', 1),
    title: 'Подсказка 50/50',
    description: 'Покупка инструмента «Подсказка 50/50».',
    price: 200,
    qrToolId: QR_TOOL_SEEDS[0].id,
  },
  {
    id: seedId('5009', 2),
    title: 'Дополнительная минута',
    description: 'Покупка инструмента «Дополнительная минута».',
    price: 150,
    qrToolId: QR_TOOL_SEEDS[1].id,
  },
  {
    id: seedId('5009', 3),
    title: 'Право на ошибку',
    description: 'Покупка инструмента «Право на ошибку».',
    price: 300,
    qrToolId: QR_TOOL_SEEDS[2].id,
  },
  {
    id: seedId('5009', 4),
    title: 'Двойные очки',
    description: 'Покупка инструмента «Двойные очки».',
    price: 400,
    qrToolId: QR_TOOL_SEEDS[3].id,
  },
  {
    id: seedId('5009', 5),
    title: 'Помощь зала',
    description: 'Покупка инструмента «Помощь зала».',
    price: 250,
    qrToolId: QR_TOOL_SEEDS[4].id,
  },
  {
    id: seedId('5009', 6),
    title: 'Шаблон слайда',
    description: 'Покупка инструмента «Шаблон слайда».',
    price: 100,
    qrToolId: QR_TOOL_SEEDS[5].id,
  },
];

// --- Presentation requirements ------------------------------------------------

type PresentationRequirementSeed = InferInsertModel<
  typeof presentationRequirements
>;

export const PRESENTATION_REQUIREMENT_SEEDS: PresentationRequirementSeed[] = [
  {
    id: seedId('eee0', 1),
    title: 'Титульный слайд',
    description: 'Название проекта и состав команды.',
    order: 1,
    isRequired: true,
  },
  {
    id: seedId('eee0', 2),
    title: 'Проблема и решение',
    description: 'Какую проблему решает проект и как именно.',
    order: 2,
    isRequired: true,
  },
  {
    id: seedId('eee0', 3),
    title: 'Целевая аудитория и рынок',
    description: 'Для кого продукт и каков объём рынка.',
    order: 3,
    isRequired: true,
  },
  {
    id: seedId('eee0', 4),
    title: 'Бизнес-модель',
    description: 'Как проект зарабатывает или создаёт ценность.',
    order: 4,
    isRequired: true,
  },
  {
    id: seedId('eee0', 5),
    title: 'Объём презентации',
    description: 'Не более 12 слайдов.',
    order: 5,
    isRequired: true,
  },
  {
    id: seedId('eee0', 6),
    title: 'Видео-демонстрация продукта',
    description: 'Короткое демо продукта (по желанию).',
    order: 6,
    isRequired: false,
  },
];

// --- Evaluation criteria (exactly the two MVP dimensions, 0–10) ---------------

type EvaluationCriterionSeed = InferInsertModel<typeof evaluationCriteria>;

export const EVALUATION_CRITERION_SEEDS: EvaluationCriterionSeed[] = [
  {
    id: seedId('c41e', 1),
    title: 'Раскрытие темы',
    description: 'Насколько полно раскрыта тема презентации.',
    minScore: 0,
    maxScore: 10,
    order: 1,
  },
  {
    id: seedId('c41e', 2),
    title: 'Дизайн презентации',
    description: 'Качество визуального оформления презентации.',
    minScore: 0,
    maxScore: 10,
    order: 2,
  },
];
