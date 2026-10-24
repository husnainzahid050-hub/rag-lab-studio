import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useEngine } from "@/components/engine/EngineProvider";
import { USER_WORKSPACE_ID } from "@/lib/sample/documents";
import { useAppStore } from "@/lib/store";
import { createFakeEmbedder, renderWithEngine, waitForPage } from "@/test/render";
import { AskView } from "./AskView";
import { ChunkingView } from "./ChunkingView";
import { DocumentsView } from "./DocumentsView";
import { EvaluationView } from "./EvaluationView";
import { OverviewView } from "./OverviewView";
import { RetrievalView } from "./RetrievalView";
import { SettingsView } from "./SettingsView";
import { WorkspaceSelector } from "@/components/shell/WorkspaceSelector";

const initialState = useAppStore.getState();

beforeEach(() => {
  useAppStore.setState(initialState, true);
});

describe("DocumentsView", () => {
  it("uploads a text file, shows it with its extracted text, and reports unsupported files", async () => {
    const { user } = renderWithEngine(<DocumentsView />);
    await waitForPage("Documents");
    act(() => useAppStore.getState().setActiveWorkspace(USER_WORKSPACE_ID));
    expect(await screen.findByText("No documents yet")).toBeInTheDocument();

    const input = screen.getByTestId("file-input");
    await user.upload(input, [
      new File(["The greenhouse is watered every Tuesday."], "plants.txt", { type: "text/plain" }),
      new File(["x"], "image.png", { type: "image/png" }),
    ]);
    // userEvent filters by the accept attribute; drop the png directly to exercise validation.
    fireEvent.change(input, { target: { files: [new File(["x"], "image.png", { type: "image/png" })] } });

    expect(await screen.findByText(/"image.png" is not supported/)).toBeInTheDocument();
    expect(await screen.findByText("plants.txt", { selector: "p.truncate.text-sm" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "View text of plants.txt" }));
    expect(screen.getByTestId("document-text")).toHaveTextContent("The greenhouse is watered every Tuesday.");
    expect(useAppStore.getState().documents.filter((d) => d.workspaceId === USER_WORKSPACE_ID)).toHaveLength(1);
  });

  it("reports an empty file as a processing failure without adding a document", async () => {
    renderWithEngine(<DocumentsView />);
    await waitForPage("Documents");
    const before = useAppStore.getState().documents.length;
    fireEvent.change(screen.getByTestId("file-input"), { target: { files: [new File([""], "empty.txt", { type: "text/plain" })] } });
    expect(await screen.findByText(/"empty.txt" is empty/)).toBeInTheDocument();
    expect(useAppStore.getState().documents).toHaveLength(before);
    expect(useAppStore.getState().pipeline.extraction.status).toBe("error");
  });

  it("removes a document only after confirmation", async () => {
    const { user } = renderWithEngine(<DocumentsView />);
    await waitForPage("Documents");
    const remove = screen.getByRole("button", { name: "Remove brewing-guide.txt" });
    await user.click(remove);
    expect(useAppStore.getState().documents.some((d) => d.name === "brewing-guide.txt")).toBe(true);
    await user.click(remove);
    expect(useAppStore.getState().documents.some((d) => d.name === "brewing-guide.txt")).toBe(false);
  });
});

describe("ChunkingView", () => {
  it("recomputes chunks when the size changes and rejects invalid overlap", async () => {
    const { user } = renderWithEngine(<ChunkingView />);
    await waitForPage("Chunking");
    const countBefore = within(screen.getByText("Chunks").closest(".rounded-xl") as HTMLElement).getByText(/^\d+$/).textContent;

    const size = screen.getByLabelText("Chunk size (characters)");
    await user.clear(size);
    await user.type(size, "200");
    await waitFor(() => expect(useAppStore.getState().settings.chunking.size).toBe(200));
    const countAfter = within(screen.getByText("Chunks").closest(".rounded-xl") as HTMLElement).getByText(/^\d+$/).textContent;
    expect(Number(countAfter)).toBeGreaterThan(Number(countBefore));

    const overlap = screen.getByLabelText("Overlap (characters)");
    await user.clear(overlap);
    await user.type(overlap, "150");
    expect(screen.getByText("Settings not applied")).toBeInTheDocument();
    expect(useAppStore.getState().settings.chunking.overlap).not.toBe(150);
  });
});

describe("RetrievalView", () => {
  it("runs a lexical search and shows ranked results with BM25 scores", async () => {
    const { user } = renderWithEngine(<RetrievalView />);
    await waitForPage("Retrieval inspector");
    await user.type(screen.getByLabelText("Query"), "descaled espresso machines");
    await user.click(screen.getByRole("button", { name: "Search" }));
    const results = await screen.findAllByTestId("retrieval-result");
    expect(within(results[0]).getByText("1")).toBeInTheDocument();
    expect(results[0]).toHaveTextContent("equipment-maintenance.txt");
    expect(results[0]).toHaveTextContent(/BM25 \d/);
  });

  it("shows an error for an empty query and an empty state for no matches", async () => {
    const { user } = renderWithEngine(<RetrievalView />);
    await waitForPage("Retrieval inspector");
    await user.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByText("Enter a query to search.")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Query"), "quantum chromodynamics");
    await user.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByText("No relevant chunks found")).toBeInTheDocument();
  });

  it("keeps semantic mode disabled until the embedding model is loaded", async () => {
    renderWithEngine(<RetrievalView />);
    await waitForPage("Retrieval inspector");
    expect(screen.getByRole("radio", { name: "Semantic" })).toBeDisabled();
  });
});

describe("AskView", () => {
  it("answers with a citation that opens the source chunk", async () => {
    const { user } = renderWithEngine(<AskView />);
    await waitForPage("Ask");
    await user.type(screen.getByLabelText("Question"), "How many days of paid annual leave do full-time employees get?");
    await user.click(screen.getByRole("button", { name: "Ask" }));
    const answer = await screen.findByTestId("answer");
    expect(answer).toHaveTextContent("22 days of paid annual leave");

    await user.click(within(answer).getByRole("button", { name: /^Citation 1/ }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("employee-handbook.md");
    expect(dialog).toHaveTextContent("22 days of paid annual leave");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("declines unsupported questions instead of guessing", async () => {
    const { user } = renderWithEngine(<AskView />);
    await waitForPage("Ask");
    await user.click(screen.getByRole("button", { name: "Who founded the company?" }));
    expect(await screen.findByTestId("insufficient-evidence")).toHaveTextContent("Not enough evidence");
    expect(screen.queryByText("Citations")).not.toBeInTheDocument();
  });
});

describe("EvaluationView", () => {
  it("shows an honest empty state, then real metrics after a run", async () => {
    const { user } = renderWithEngine(<EvaluationView />);
    await waitForPage("Evaluation");
    expect(screen.getByText("No evaluation has been run in this workspace")).toBeInTheDocument();
    expect(screen.queryByText("Pass rate")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Run 7 case/ }));
    expect(await screen.findByText("Case results")).toBeInTheDocument();
    const run = useAppStore.getState().evalRuns[0];
    expect(run.results).toHaveLength(7);
    expect(screen.getByText(`${run.summary.passed}/${run.summary.validCases} valid cases`)).toBeInTheDocument();
  });

  it("adds a user test case and validates it", async () => {
    const { user } = renderWithEngine(<EvaluationView />);
    await waitForPage("Evaluation");
    await user.click(screen.getByRole("button", { name: /Add test case/ }));
    await user.click(screen.getByRole("button", { name: "Save test case" }));
    expect(screen.getByText("This test case is not valid yet")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Question"), "What should staff wear when handling the roaster drum?");
    await user.click(screen.getByRole("checkbox", { name: "employee-handbook.md" }));
    await user.type(screen.getByLabelText("Evidence phrases (one per line)"), "Heat-resistant gloves");
    await user.click(screen.getByRole("button", { name: "Save test case" }));

    const saved = useAppStore.getState().evalCases.find((c) => c.origin === "user");
    expect(saved).toMatchObject({ expectedDocIds: ["sample-handbook"], evidencePhrases: ["Heat-resistant gloves"] });
    expect(screen.getByText("Your case")).toBeInTheDocument();
  });
});

describe("Overview and pipeline", () => {
  it("reflects real stage state: retrieval is not run until a search happens", async () => {
    function SearchOnce() {
      const { search } = useEngine();
      return <button onClick={() => void search("refund", 3, "lexical")}>search now</button>;
    }
    const { user } = renderWithEngine(
      <>
        <OverviewView />
        <SearchOnce />
      </>,
    );
    await waitForPage(/Ask your documents/);
    const retrieval = screen.getByTestId("stage-retrieval");
    expect(retrieval).toHaveTextContent("Not run");
    await waitFor(() => expect(screen.getByTestId("stage-chunking")).toHaveTextContent("Done"));
    await user.click(screen.getByRole("button", { name: "search now" }));
    await waitFor(() => expect(screen.getByTestId("stage-retrieval")).toHaveTextContent("Done"));
  });
});

describe("SettingsView and the embedding engine", () => {
  it("loads the embedding model, embeds every chunk and enables semantic retrieval", async () => {
    const { user } = renderWithEngine(<SettingsView />);
    await waitForPage("Settings");
    await user.click(screen.getByRole("button", { name: /Download and load model/ }));
    expect(await screen.findByText(/Loaded \(test\)/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/(\d+)\/\1 chunks embedded/)).toBeInTheDocument());
    const option = screen.getByRole("option", { name: "Semantic (embeddings)" }) as HTMLOptionElement;
    expect(option.disabled).toBe(false);
  });

  it("reports a failed model load and keeps lexical mode", async () => {
    const { user } = renderWithEngine(<SettingsView />, () => createFakeEmbedder({ failLoad: true }));
    await waitForPage("Settings");
    await user.click(screen.getByRole("button", { name: /Download and load model/ }));
    expect(await screen.findByText(/could not be loaded: network unavailable/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Retry loading/ })).toBeInTheDocument();
    expect(useAppStore.getState().settings.retrieval.mode).toBe("lexical");
  });

  it("clears local data after confirmation and restores the sample workspace", async () => {
    const { user } = renderWithEngine(<SettingsView />);
    await waitForPage("Settings");
    act(() => {
      useAppStore.getState().setActiveWorkspace(USER_WORKSPACE_ID);
      useAppStore.getState().addDocument({
        id: "doc-x",
        workspaceId: USER_WORKSPACE_ID,
        name: "private.txt",
        kind: "text",
        origin: "user",
        sizeBytes: 5,
        text: "hello",
        charCount: 5,
        warnings: [],
        extractionMs: 1,
        addedAt: new Date().toISOString(),
      });
    });
    const clear = screen.getByRole("button", { name: /Clear all local data/ });
    await user.click(clear);
    await user.click(screen.getByRole("button", { name: "Delete everything?" }));
    expect(await screen.findByText(/were deleted/)).toBeInTheDocument();
    const state = useAppStore.getState();
    expect(state.documents.some((d) => d.name === "private.txt")).toBe(false);
    expect(state.documents.every((d) => d.origin === "sample")).toBe(true);
    expect(state.evalRuns).toEqual([]);
  });
});

describe("Features for your own data", () => {
  it("adds pasted text as a document", async () => {
    const { user } = renderWithEngine(<DocumentsView />);
    await waitForPage("Documents");
    act(() => useAppStore.getState().setActiveWorkspace(USER_WORKSPACE_ID));
    await user.click(screen.getByRole("radio", { name: "Paste text" }));
    await user.type(screen.getByLabelText("Title"), "Team notes");
    await user.type(screen.getByLabelText("Text"), "The launch is planned for the second week of May.");
    await user.click(screen.getByRole("button", { name: /Add as document/ }));
    expect(await screen.findByText(/Added .Team notes./)).toBeInTheDocument();
    const docs = useAppStore.getState().documents.filter((d) => d.workspaceId === USER_WORKSPACE_ID);
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ name: "Team notes", kind: "text", origin: "user" });
  });

  it("creates and switches workspaces from the selector", async () => {
    const { user } = renderWithEngine(<WorkspaceSelector />);
    await waitFor(() => expect(useAppStore.getState().hydrated).toBe(true));
    await user.click(screen.getByRole("button", { name: /Workspace:/ }));
    await user.click(screen.getByRole("button", { name: /New workspace/ }));
    await user.type(screen.getByLabelText("New workspace name"), "Contracts");
    await user.click(screen.getByRole("button", { name: "Create" }));
    const s = useAppStore.getState();
    expect(s.workspaces.find((w) => w.id === s.activeWorkspaceId)?.name).toBe("Contracts");
    expect(screen.getByRole("button", { name: "Workspace: Contracts" })).toBeInTheDocument();
  });

  it("keeps a chat history of questions and answers", async () => {
    const { user } = renderWithEngine(<AskView />);
    await waitForPage("Ask");
    await user.type(screen.getByLabelText("Question"), "How long does refund processing take?{Enter}");
    await screen.findByTestId("answer");
    await user.type(screen.getByLabelText("Question"), "Who founded the company?{Enter}");
    await screen.findByTestId("insufficient-evidence");
    expect(screen.getByText("How long does refund processing take?", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText("Who founded the company?", { selector: "p" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Clear chat/ }));
    expect(screen.queryByTestId("answer")).not.toBeInTheDocument();
  });

  it("runs hybrid retrieval once the model is loaded", async () => {
    function LoadModel() {
      const { loadModel, semanticReady } = useEngine();
      return (
        <button onClick={() => void loadModel({ switchToHybrid: true })}>{semanticReady ? "model ready" : "load model"}</button>
      );
    }
    const { user } = renderWithEngine(
      <>
        <LoadModel />
        <RetrievalView />
      </>,
    );
    await waitForPage("Retrieval inspector");
    await user.click(screen.getByRole("button", { name: "load model" }));
    await screen.findByRole("button", { name: "model ready" });
    expect(useAppStore.getState().settings.retrieval.mode).toBe("hybrid");
    await user.click(screen.getByRole("radio", { name: "Hybrid" }));
    await user.type(screen.getByLabelText("Query"), "descaled espresso machines");
    await user.click(screen.getByRole("button", { name: "Search" }));
    const results = await screen.findAllByTestId("retrieval-result");
    expect(results[0]).toHaveTextContent(/RRF \d/);
    expect(results[0]).toHaveTextContent(/BM25 #\d · vector #\d/);
  });
});
