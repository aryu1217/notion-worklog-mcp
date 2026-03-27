import {
  APIErrorCode,
  APIResponseError,
  Client,
  collectPaginatedAPI,
  extractNotionId,
  isFullDataSource,
  isFullDatabase,
  isFullPage,
  isFullPageOrDataSource,
} from "@notionhq/client";
import type {
  DataSourceObjectResponse,
  DatabaseObjectResponse,
  PageObjectResponse,
  PartialDataSourceObjectResponse,
  PartialDatabaseObjectResponse,
  PartialPageObjectResponse,
  RichTextItemResponse,
} from "@notionhq/client";

import { loadConfig } from "./config.js";
import { resolveEntryDateLabel, sha256 } from "./utils.js";

const NOTION_API_VERSION = "2026-03-11";
const WORKLOG_DATE_PROPERTY_NAME = "Date";
const WORKLOG_DEFAULT_TITLE_PROPERTY_NAME = "Name";

export type WorklogTargetType = "parent_page" | "data_source";
export type BootstrapAction =
  | "used_existing_data_source"
  | "created_database"
  | "created_daily_page"
  | "appended_existing_daily_page";

export type WorklogValidationResult = {
  ok: boolean;
  configured: boolean;
  pageId: string | null;
  pageTitle: string | null;
  pageUrl: string | null;
  canReadContent: boolean;
  updateCapabilityHint: string;
  details: string;
  targetType: WorklogTargetType;
  databaseId: string | null;
  dataSourceId: string | null;
  databaseTitle: string | null;
  dailyPageId: string | null;
  dailyPageTitle: string | null;
  bootstrapAction?: BootstrapAction | null;
};

export type WorklogAppendResult = {
  ok: boolean;
  pageId: string | null;
  pageUrl: string | null;
  heading: string;
  appendedCharacters: number;
  resultMarkdownLength: number;
  details: string;
  targetType: WorklogTargetType;
  databaseId: string | null;
  dataSourceId: string | null;
  databaseTitle: string | null;
  dailyPageId: string | null;
  dailyPageTitle: string | null;
  bootstrapAction: BootstrapAction | null;
};

type ResolvedParentPage = {
  pageId: string;
  pageTitle: string | null;
  pageUrl: string | null;
};

type ResolvedDataSource = {
  targetType: WorklogTargetType;
  databaseId: string | null;
  dataSourceId: string | null;
  databaseTitle: string | null;
  dataSource: DataSourceObjectResponse | null;
  titlePropertyName: string | null;
  datePropertyName: string | null;
  bootstrapAction?: BootstrapAction;
};

type ResolvedDailyPage = {
  dailyPage: PageObjectResponse | null;
  created: boolean;
};

function normalizeNotionId(value: string | null) {
  if (!value) return null;

  const trimmed = value.trim();
  const extracted = extractNotionId(trimmed);
  if (extracted) return extracted;

  const hex = trimmed.replace(/-/g, "");
  if (/^[0-9a-fA-F]{32}$/.test(hex)) {
    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20),
    ].join("-");
  }

  return trimmed;
}

function notionClient(apiKey: string) {
  return new Client({
    auth: apiKey,
    notionVersion: NOTION_API_VERSION,
  });
}

function formatNotionError(error: unknown) {
  if (error instanceof APIResponseError) {
    return `${error.code}: ${error.message}`;
  }

  return error instanceof Error ? error.message : "Unknown Notion API error";
}

function isObjectNotFound(error: unknown) {
  return (
    error instanceof APIResponseError &&
    error.code === APIErrorCode.ObjectNotFound
  );
}

function extractRichTextPlainText(richText: RichTextItemResponse[]) {
  return richText.map((item) => item.plain_text).join("").trim();
}

function extractPageTitle(page: PageObjectResponse) {
  const titleProperty = Object.values(page.properties).find(
    (property) => property.type === "title",
  );

  if (!titleProperty || titleProperty.type !== "title") return null;

  const title = titleProperty.title.map((item) => item.plain_text).join("").trim();
  return title || null;
}

function extractDatabaseTitle(database: DatabaseObjectResponse) {
  const title = extractRichTextPlainText(database.title);
  return title || null;
}

function extractDataSourceTitle(dataSource: DataSourceObjectResponse) {
  const title = extractRichTextPlainText(dataSource.title);
  return title || null;
}

function toRichText(content: string) {
  return [
    {
      type: "text" as const,
      text: {
        content,
      },
    },
  ];
}

function extractDatabaseId(dataSource: DataSourceObjectResponse) {
  return dataSource.parent.type === "database_id"
    ? dataSource.parent.database_id
    : null;
}

function extractParentPageId(dataSource: DataSourceObjectResponse) {
  return dataSource.database_parent.type === "page_id"
    ? dataSource.database_parent.page_id
    : null;
}

function resolveWorklogSchema(dataSource: DataSourceObjectResponse) {
  const titleProperty = Object.values(dataSource.properties).find(
    (property) => property.type === "title",
  );

  if (!titleProperty || titleProperty.type !== "title") {
    throw new Error("The worklog data source is missing a title property.");
  }

  const dateProperty = Object.values(dataSource.properties).find(
    (property) => property.name === WORKLOG_DATE_PROPERTY_NAME,
  );

  if (!dateProperty || dateProperty.type !== "date") {
    throw new Error(
      `The worklog data source is missing the "${WORKLOG_DATE_PROPERTY_NAME}" date property.`,
    );
  }

  return {
    titlePropertyName:
      titleProperty.name?.trim() || WORKLOG_DEFAULT_TITLE_PROPERTY_NAME,
    datePropertyName: dateProperty.name,
  };
}

async function ensureFullPage(
  client: Client,
  page: PageObjectResponse | PartialPageObjectResponse,
) {
  if (isFullPage(page)) return page;

  const retrieved = await client.pages.retrieve({ page_id: page.id });
  if (!isFullPage(retrieved)) {
    throw new Error("Notion returned only a partial page response.");
  }

  return retrieved;
}

async function ensureFullDataSource(
  client: Client,
  dataSource: DataSourceObjectResponse | PartialDataSourceObjectResponse,
) {
  if (isFullDataSource(dataSource)) return dataSource;

  const retrieved = await client.dataSources.retrieve({
    data_source_id: dataSource.id,
  });
  if (!isFullDataSource(retrieved)) {
    throw new Error("Notion returned only a partial data source response.");
  }

  return retrieved;
}

async function ensureFullDatabase(
  client: Client,
  database: DatabaseObjectResponse | PartialDatabaseObjectResponse,
) {
  if (isFullDatabase(database)) return database;

  const retrieved = await client.databases.retrieve({
    database_id: database.id,
  });
  if (!isFullDatabase(retrieved)) {
    throw new Error("Notion returned only a partial database response.");
  }

  return retrieved;
}

async function resolveParentPage(
  client: Client,
  parentPageId: string,
): Promise<ResolvedParentPage> {
  const page = await client.pages.retrieve({ page_id: parentPageId });
  if (!isFullPage(page)) {
    throw new Error("Notion returned only a partial parent page response.");
  }

  return {
    pageId: parentPageId,
    pageTitle: extractPageTitle(page),
    pageUrl: page.url ?? null,
  };
}

async function listMatchingWorklogDataSources(
  client: Client,
  {
    parentPageId,
    databaseTitle,
  }: {
    parentPageId: string;
    databaseTitle: string;
  },
) {
  const search = client.search.bind(client);
  const results = await collectPaginatedAPI(search, {
    query: databaseTitle,
    filter: {
      property: "object",
      value: "data_source",
    },
    page_size: 100,
  });

  const candidates: DataSourceObjectResponse[] = [];

  for (const result of results) {
    if (!isFullPageOrDataSource(result) || result.object !== "data_source") {
      continue;
    }

    const dataSource = await ensureFullDataSource(client, result);
    if (dataSource.in_trash) continue;
    if (extractDataSourceTitle(dataSource) !== databaseTitle) continue;
    if (extractParentPageId(dataSource) !== parentPageId) continue;

    candidates.push(dataSource);
  }

  return candidates;
}

async function createWorklogDatabase(
  client: Client,
  {
    parentPageId,
    databaseTitle,
  }: {
    parentPageId: string;
    databaseTitle: string;
  },
) {
  const created = await client.databases.create({
    parent: {
      type: "page_id",
      page_id: parentPageId,
    },
    title: toRichText(databaseTitle),
    is_inline: false,
    initial_data_source: {
      properties: {
        [WORKLOG_DEFAULT_TITLE_PROPERTY_NAME]: {
          type: "title",
          title: {},
        },
        [WORKLOG_DATE_PROPERTY_NAME]: {
          type: "date",
          date: {},
        },
      },
    },
  });

  const database = await ensureFullDatabase(client, created);
  const dataSourceRef = database.data_sources.at(0);

  if (!dataSourceRef) {
    throw new Error("Could not find the default data source on the created database.");
  }

  const dataSource = await ensureFullDataSource(
    client,
    await client.dataSources.retrieve({
      data_source_id: dataSourceRef.id,
    }),
  );

  return {
    database,
    dataSource,
  };
}

async function resolveConfiguredDataSource(
  client: Client,
  configuredDataSourceId: string,
  parentPageId: string,
) {
  const retrieved = await client.dataSources.retrieve({
    data_source_id: configuredDataSourceId,
  });
  const dataSource = await ensureFullDataSource(client, retrieved);

  if (extractParentPageId(dataSource) !== parentPageId) {
    throw new Error(
      "NOTION_DATA_SOURCE_ID does not point to a data source under NOTION_PARENT_PAGE_ID.",
    );
  }

  const databaseId = extractDatabaseId(dataSource);
  if (!databaseId) {
    throw new Error("Could not resolve the parent database ID of the worklog data source.");
  }

  const database = await ensureFullDatabase(
    client,
    await client.databases.retrieve({ database_id: databaseId }),
  );
  const { titlePropertyName, datePropertyName } = resolveWorklogSchema(dataSource);

  return {
    targetType: "data_source" as const,
    databaseId: database.id,
    dataSourceId: dataSource.id,
    databaseTitle: extractDatabaseTitle(database),
    dataSource,
    titlePropertyName,
    datePropertyName,
    bootstrapAction: "used_existing_data_source" as const,
  };
}

async function resolveDataSourceTarget(
  client: Client,
  {
    parentPageId,
    configuredDataSourceId,
    databaseTitle,
    allowCreate,
  }: {
    parentPageId: string;
    configuredDataSourceId: string | null;
    databaseTitle: string;
    allowCreate: boolean;
  },
): Promise<ResolvedDataSource> {
  if (configuredDataSourceId) {
    return resolveConfiguredDataSource(
      client,
      configuredDataSourceId,
      parentPageId,
    );
  }

  const matches = await listMatchingWorklogDataSources(client, {
    parentPageId,
    databaseTitle,
  });
  if (matches.length > 1) {
    throw new Error(
      "Found more than one matching worklog data source under the parent page. Set NOTION_DATA_SOURCE_ID explicitly.",
    );
  }

  if (matches.length === 1) {
    const dataSource = matches[0];
    const databaseId = extractDatabaseId(dataSource);
    if (!databaseId) {
      throw new Error("Could not resolve the parent database ID of the worklog data source.");
    }

    const database = await ensureFullDatabase(
      client,
      await client.databases.retrieve({ database_id: databaseId }),
    );
    const { titlePropertyName, datePropertyName } = resolveWorklogSchema(dataSource);

    return {
      targetType: "data_source",
      databaseId: database.id,
      dataSourceId: dataSource.id,
      databaseTitle: extractDatabaseTitle(database),
      dataSource,
      titlePropertyName,
      datePropertyName,
      bootstrapAction: "used_existing_data_source",
    };
  }

  if (!allowCreate) {
    return {
      targetType: "parent_page",
      databaseId: null,
      dataSourceId: null,
      databaseTitle: null,
      dataSource: null,
      titlePropertyName: null,
      datePropertyName: null,
    };
  }

  const { database, dataSource } = await createWorklogDatabase(client, {
    parentPageId,
    databaseTitle,
  });
  const { titlePropertyName, datePropertyName } = resolveWorklogSchema(dataSource);

  return {
    targetType: "data_source",
    databaseId: database.id,
    dataSourceId: dataSource.id,
    databaseTitle: extractDatabaseTitle(database),
    dataSource,
    titlePropertyName,
    datePropertyName,
    bootstrapAction: "created_database",
  };
}

async function resolveDailyPage(
  client: Client,
  {
    dataSource,
    titlePropertyName,
    datePropertyName,
    dateKey,
    allowCreate,
  }: {
    dataSource: DataSourceObjectResponse;
    titlePropertyName: string;
    datePropertyName: string;
    dateKey: string;
    allowCreate: boolean;
  },
): Promise<ResolvedDailyPage> {
  const query = await client.dataSources.query({
    data_source_id: dataSource.id,
    result_type: "page",
    page_size: 10,
    filter: {
      property: datePropertyName,
      date: {
        equals: dateKey,
      },
    },
  });

  const pages: PageObjectResponse[] = [];
  for (const result of query.results) {
    if (result.object !== "page") continue;
    pages.push(await ensureFullPage(client, result));
  }

  if (pages.length > 1) {
    throw new Error(
      `Found more than one worklog page with Date=${dateKey}. Clean up the duplicates before continuing.`,
    );
  }

  if (pages.length === 1) {
    return {
      dailyPage: pages[0],
      created: false,
    };
  }

  if (!allowCreate) {
    return {
      dailyPage: null,
      created: false,
    };
  }

  const created = await client.pages.create({
    parent: {
      data_source_id: dataSource.id,
    },
    properties: {
      [titlePropertyName]: {
        title: toRichText(dateKey),
      },
      [datePropertyName]: {
        date: {
          start: dateKey,
        },
      },
    },
  });

  return {
    dailyPage: await ensureFullPage(client, created),
    created: true,
  };
}

function validationHint() {
  return [
    "Enable read_content and update_content on the Notion integration,",
    "share the parent page with that integration,",
    "then add a calendar view manually in Notion after the database is created.",
  ].join(" ");
}

function emptyValidationResult(
  overrides: Partial<WorklogValidationResult>,
): WorklogValidationResult {
  return {
    ok: false,
    configured: false,
    pageId: null,
    pageTitle: null,
    pageUrl: null,
    canReadContent: false,
    updateCapabilityHint: validationHint(),
    details: "",
    targetType: "parent_page",
    databaseId: null,
    dataSourceId: null,
    databaseTitle: null,
    dailyPageId: null,
    dailyPageTitle: null,
    bootstrapAction: null,
    ...overrides,
  };
}

function emptyAppendResult(
  heading: string,
  overrides: Partial<WorklogAppendResult>,
): WorklogAppendResult {
  return {
    ok: false,
    pageId: null,
    pageUrl: null,
    heading,
    appendedCharacters: 0,
    resultMarkdownLength: 0,
    details: "",
    targetType: "parent_page",
    databaseId: null,
    dataSourceId: null,
    databaseTitle: null,
    dailyPageId: null,
    dailyPageTitle: null,
    bootstrapAction: null,
    ...overrides,
  };
}

export async function validateNotionTarget(
  {
    entryDate,
    startDir = process.cwd(),
  }: {
    entryDate?: string | Date;
    startDir?: string;
  } = {},
): Promise<WorklogValidationResult> {
  const {
    notionApiKey,
    notionParentPageId,
    notionDataSourceId,
    databaseTitle,
    timeZone,
  } = loadConfig(startDir);
  const parentPageId = normalizeNotionId(notionParentPageId);
  const configuredDataSourceId = normalizeNotionId(notionDataSourceId);

  if (!notionApiKey || !parentPageId) {
    return emptyValidationResult({
      details: "NOTION_API_KEY or NOTION_PARENT_PAGE_ID is missing.",
      pageId: parentPageId,
    });
  }

  const client = notionClient(notionApiKey);
  const dateKey = resolveEntryDateLabel(entryDate, timeZone);

  try {
    const parentPage = await resolveParentPage(client, parentPageId);
    const dataSourceTarget = await resolveDataSourceTarget(client, {
      parentPageId,
      configuredDataSourceId,
      databaseTitle,
      allowCreate: false,
    });

    if (!dataSourceTarget.dataSource) {
      return emptyValidationResult({
        ok: true,
        configured: true,
        pageId: parentPage.pageId,
        pageTitle: parentPage.pageTitle,
        pageUrl: parentPage.pageUrl,
        canReadContent: true,
        details:
          "Parent page access succeeded. The worklog database will be created on the first append.",
      });
    }

    const dailyPage = await resolveDailyPage(client, {
      dataSource: dataSourceTarget.dataSource,
      titlePropertyName:
        dataSourceTarget.titlePropertyName ?? WORKLOG_DEFAULT_TITLE_PROPERTY_NAME,
      datePropertyName:
        dataSourceTarget.datePropertyName ?? WORKLOG_DATE_PROPERTY_NAME,
      dateKey,
      allowCreate: false,
    });

    if (dailyPage.dailyPage) {
      await client.pages.retrieveMarkdown({
        page_id: dailyPage.dailyPage.id,
      });
    }

    return emptyValidationResult({
      ok: true,
      configured: true,
      pageId: parentPage.pageId,
      pageTitle: parentPage.pageTitle,
      pageUrl: parentPage.pageUrl,
      canReadContent: true,
      details: dailyPage.dailyPage
        ? "Parent page, worklog data source, and target daily page are all accessible."
        : "Parent page and worklog data source are accessible. The target daily page will be created on append.",
      targetType: dataSourceTarget.targetType,
      databaseId: dataSourceTarget.databaseId,
      dataSourceId: dataSourceTarget.dataSourceId,
      databaseTitle: dataSourceTarget.databaseTitle,
      dailyPageId: dailyPage.dailyPage?.id ?? null,
      dailyPageTitle: dailyPage.dailyPage
        ? extractPageTitle(dailyPage.dailyPage) ?? dateKey
        : null,
      bootstrapAction: dataSourceTarget.bootstrapAction ?? null,
    });
  } catch (error) {
    return emptyValidationResult({
      configured: true,
      pageId: parentPageId,
      details: formatNotionError(error),
    });
  }
}

export async function appendWorklogEntry(
  {
    heading,
    markdown,
    previewHash,
    entryDate,
    startDir = process.cwd(),
  }: {
    heading: string;
    markdown: string;
    previewHash?: string;
    entryDate?: string | Date;
    startDir?: string;
  },
): Promise<WorklogAppendResult> {
  const {
    notionApiKey,
    notionParentPageId,
    notionDataSourceId,
    databaseTitle,
    timeZone,
  } = loadConfig(startDir);
  const parentPageId = normalizeNotionId(notionParentPageId);
  const configuredDataSourceId = normalizeNotionId(notionDataSourceId);

  if (!notionApiKey || !parentPageId) {
    return emptyAppendResult(heading, {
      details: "NOTION_API_KEY or NOTION_PARENT_PAGE_ID is missing.",
    });
  }

  const content = `${heading.trim()}\n\n${markdown.trim()}\n`;
  if (previewHash && previewHash.length > 0 && sha256(content) !== previewHash) {
    return emptyAppendResult(heading, {
      details:
        "previewHash does not match the current payload. Reconfirm the draft before appending.",
    });
  }

  const client = notionClient(notionApiKey);
  const dateKey = resolveEntryDateLabel(entryDate, timeZone);

  try {
    await resolveParentPage(client, parentPageId);

    const dataSourceTarget = await resolveDataSourceTarget(client, {
      parentPageId,
      configuredDataSourceId,
      databaseTitle,
      allowCreate: true,
    });

    if (
      !dataSourceTarget.dataSource ||
      !dataSourceTarget.titlePropertyName ||
      !dataSourceTarget.datePropertyName
    ) {
      throw new Error("Could not resolve the worklog data source.");
    }

    const dailyPage = await resolveDailyPage(client, {
      dataSource: dataSourceTarget.dataSource,
      titlePropertyName: dataSourceTarget.titlePropertyName,
      datePropertyName: dataSourceTarget.datePropertyName,
      dateKey,
      allowCreate: true,
    });

    if (!dailyPage.dailyPage) {
      throw new Error("Could not create the target worklog page.");
    }

    const markdownResponse = await client.pages.updateMarkdown({
      page_id: dailyPage.dailyPage.id,
      type: "insert_content",
      insert_content: {
        content,
      },
    });

    const bootstrapAction: BootstrapAction =
      dataSourceTarget.bootstrapAction === "created_database"
        ? "created_database"
        : dailyPage.created
          ? "created_daily_page"
          : "appended_existing_daily_page";

    const details =
      bootstrapAction === "created_database"
        ? "Created the worklog database under the parent page and appended the entry."
        : bootstrapAction === "created_daily_page"
          ? "Created the target daily page and appended the entry."
          : "Appended the entry to the existing daily page.";

    return emptyAppendResult(heading, {
      ok: true,
      pageId: dailyPage.dailyPage.id,
      pageUrl: dailyPage.dailyPage.url ?? null,
      appendedCharacters: content.length,
      resultMarkdownLength: markdownResponse.markdown.length,
      details,
      targetType: "data_source",
      databaseId: dataSourceTarget.databaseId,
      dataSourceId: dataSourceTarget.dataSourceId,
      databaseTitle: dataSourceTarget.databaseTitle,
      dailyPageId: dailyPage.dailyPage.id,
      dailyPageTitle: extractPageTitle(dailyPage.dailyPage) ?? dateKey,
      bootstrapAction,
    });
  } catch (error) {
    const message =
      isObjectNotFound(error) && configuredDataSourceId
        ? "NOTION_DATA_SOURCE_ID points to a data source that could not be found."
        : formatNotionError(error);

    return emptyAppendResult(heading, {
      details: message,
    });
  }
}
