# notion-worklog-mcp

`notion-worklog-mcp` is a local MCP server that helps an LLM turn Git activity into structured Notion work documentation.

It is built for two common workflows:

1. Document the work you are doing right now.
2. Reconstruct work from a past date or a specific commit.

The server does not generate prose by itself. It provides:

- Git context collection
- built-in templates
- Notion target validation
- safe append into a daily Notion page

Your MCP client or coding assistant writes the final Markdown after reading the context.

## What This Is

This package is for teams or solo developers who want to keep a running work history in Notion without manually copying commit messages or writing every page from scratch.

By default, it:

- uses your current Git repository as the source of truth
- creates or reuses a Notion database called `Work Documentation Calendar`
- stores one daily page per date
- appends reviewed Markdown to the matching date page

It supports:

- current work documentation
- historical documentation by date
- historical documentation by commit

## Quick Start

### 1. Install the package

You can install it locally in a project:

```bash
npm install -D notion-worklog-mcp
```

Or run it through `npx` in MCP configs:

```bash
npx --yes notion-worklog-mcp
```

### 2. Create a Notion integration

1. Open `https://www.notion.so/profile/integrations`.
2. Click `New integration`.
3. Give it a name such as `Worklog MCP`.
4. Enable at least these capabilities:
   - `read_content`
   - `update_content`
5. Copy the internal integration token.

### 3. Prepare a parent page in Notion

1. Create or choose a normal Notion page that will hold your worklog database.
2. Open the page menu.
3. Use `Connections` or `Add connections`.
4. Add the integration you created in the previous step.

This page is the value you will use for `NOTION_PARENT_PAGE_ID`.

You can paste either:

- the page URL
- the raw page ID

### 4. Configure `.env`

Create `.env.local` in the repository you want to document.

```bash
NOTION_API_KEY=secret_xxx
NOTION_PARENT_PAGE_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
NOTION_DATA_SOURCE_ID=
WORKLOG_DATABASE_TITLE=Work Documentation Calendar
WORKLOG_TIME_ZONE=Asia/Seoul
```

Required values:

- `NOTION_API_KEY`
- `NOTION_PARENT_PAGE_ID`

Optional values:

- `NOTION_DATA_SOURCE_ID`
- `WORKLOG_DATABASE_TITLE`
- `WORKLOG_TIME_ZONE`
- `WORKLOG_TEMPLATE_DIR`

If `NOTION_DATA_SOURCE_ID` is empty, the server will:

- reuse an existing matching database under the parent page if it finds exactly one
- create a new database on first append if it finds none
- stop with an error if it finds more than one match

### 5. Run the doctor command

If you installed the package locally:

```bash
npx notion-worklog-mcp-doctor
```

If you want to run the doctor without installing first:

```bash
npx --yes --package notion-worklog-mcp notion-worklog-mcp-doctor
```

Success means you should see:

- the current Git branch and merge-base information
- whether Notion credentials were detected
- whether the parent page is reachable
- whether the worklog database already exists

## Add The MCP Server

### Codex

The simplest option is:

```bash
codex mcp add worklog -- npx --yes notion-worklog-mcp
```

If your MCP setup uses JSON snippets, see [examples/codex.mcp.json](../examples/codex.mcp.json).

### Cursor

Use the example in [examples/cursor.mcp.json](../examples/cursor.mcp.json).

### Claude Desktop

Use the example in [examples/claude_desktop_config.json](../examples/claude_desktop_config.json).

## Current Work Documentation

Use this when you want to document the work currently in progress, including:

- working tree changes
- staged changes
- commits since merge-base
- remaining follow-up work

Recommended tool flow:

1. `validate_notion_target`
2. `collect_current_work_context`
3. `load_worklog_template` with `mode: "current"`
4. ask the assistant to draft the Markdown
5. review the draft
6. `append_worklog_entry`

Example prompt:

```text
Document the work I have done so far. Use the current work template, keep the writing concise, and wait for my approval before appending to Notion.
```

## Historical Documentation By Date

Use this when you want to reconstruct work for a specific day.

Recommended tool flow:

1. `validate_notion_target` with `entryDate`
2. `collect_historical_work_context` with `date: "YYYY-MM-DD"`
3. `load_worklog_template` with `mode: "historical"`
4. ask the assistant to draft the Markdown
5. review the draft
6. `append_worklog_entry` with the same `entryDate`

Example prompt:

```text
Document the work from 2026-02-11 based on Git history. Use the historical template, do not add a Remaining Work section, and wait for my approval before appending.
```

## Historical Documentation By Commit

Use this when you want a worklog page section for one exact commit.

Recommended tool flow:

1. `validate_notion_target` with the commit date or the target date you want to use
2. `collect_historical_work_context` with `commit: "abc1234"`
3. `load_worklog_template` with `mode: "historical"`
4. ask the assistant to draft the Markdown
5. review the draft
6. `append_worklog_entry`

Example prompt:

```text
Document commit 92aaaf9 as a historical work item. Use the historical template and focus on what changed and why.
```

## Built-In Templates

The package ships with two templates:

- [templates/current.md](../templates/current.md)
- [templates/historical.md](../templates/historical.md)

Template rules:

- `current` includes a `Remaining Work` section
- `historical` does not include a `Remaining Work` section

If you want custom templates:

```bash
WORKLOG_TEMPLATE_DIR=/absolute/or/relative/path/to/templates
```

That directory must include:

- `current.md`
- `historical.md`

## Notion Storage Layout

This package uses the following structure:

- page title: `YYYY-MM-DD`
- `Date` property: the same date string
- one page per day

Append rules:

- if the date page exists, the Markdown is appended
- if the date page does not exist, it is created
- if the database does not exist, it is created on first append
- if multiple pages exist for the same date, the append is blocked

## Tool Reference

### `validate_notion_target`

Checks:

- credentials
- parent page access
- matching database/data source
- target date page availability

Optional input:

- `entryDate`

### `collect_current_work_context`

Returns:

- branch and merge-base info
- commits since merge-base
- staged and unstaged files
- diff stats and excerpts

### `collect_historical_work_context`

Accepts exactly one of:

- `date`
- `commit`

Returns:

- reference date
- relevant commits
- changed files
- diff stat
- diff excerpt

### `load_worklog_template`

Accepts:

- `mode: "current" | "historical"`

### `append_worklog_entry`

Accepts:

- `heading`
- `markdown`
- optional `entryDate`
- optional `previewHash`

## Troubleshooting

### `NOTION_API_KEY or NOTION_PARENT_PAGE_ID is missing.`

Check:

- `.env.local` exists in the repository you are documenting
- the keys are spelled correctly
- your MCP client is launching the server from the intended project directory

### `NOTION_DATA_SOURCE_ID points to a data source that could not be found.`

Check:

- the database still exists
- the integration still has access
- the ID belongs to the same parent page you configured

### `Found more than one matching worklog data source under the parent page.`

Fix:

- set `NOTION_DATA_SOURCE_ID` explicitly

### `No commits were found on YYYY-MM-DD.`

Check:

- the date is correct
- the repository actually has commits on that date in the configured timezone
- `WORKLOG_TIME_ZONE` matches the timezone you expect

### `previewHash does not match the current payload.`

This means the draft changed after review. Generate a new preview hash and try again.

## FAQ

### Does this package generate the final text for me?

No. It only provides Git context, templates, validation, and append operations. Your assistant writes the prose.

### Why not use a generic Notion MCP server?

You can. This package exists because generic Notion tools do not usually include:

- Git-aware current work summaries
- historical reconstruction by date or commit
- built-in worklog templates
- daily page creation and append rules

### Can I use it without an assistant?

Mostly yes. The `doctor` command is useful on its own, and the core module can be scripted. The main user experience is still MCP-first.

### Does historical mode include a Remaining Work section?

No. Historical mode is intentionally archive-focused.

### Can I use a custom database title?

Yes. Set `WORKLOG_DATABASE_TITLE`.

## Korean Documentation

See [README.md](../README.md) for the default Korean guide.
