import { useEffect, useRef, useState } from "react";

type SessionTerminal = {
  name: string;
  type: string;
  dangerous?: boolean;
  session_id: string;
};

type SessionWorktree = {
  name: string;
  terminals: SessionTerminal[];
};

type SessionPlan = {
  name: string;
  session_id: string;
  related_issue?: number;
};

type SessionRepository = {
  name: string;
  plans: SessionPlan[];
  worktrees: SessionWorktree[];
};

type SessionWorkspace = {
  name: string;
  repositories: SessionRepository[];
};

type ApiResponse<T> = {
  data: T;
  message?: string;
};

const HANDLE_WIDTH = 5;

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  display: "grid",
  gridTemplateColumns: `320px ${HANDLE_WIDTH}px 1fr`,
  background: "radial-gradient(circle at 25% 25%, #0ea5e9 0, #0f172a 40%)",
  color: "#e2e8f0",
  fontFamily: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  overflow: "hidden",
};

const sidebarStyle: React.CSSProperties = {
  background: "transparent",
  padding: "1.75rem",
  overflowY: "auto",
  zIndex: 0,
};

const contentAreaStyle: React.CSSProperties = {
  padding: "1.5rem",
  overflow: "hidden",
  background: "#0b1224",
  boxShadow: "none",
  borderRadius: "32px 0 0 32px",
  borderLeft: "1px solid rgba(226, 232, 240, 0.06)",
  transform: "translateX(0)",
  position: "relative",
  zIndex: 1,
};

const handleStyle: React.CSSProperties = {
  width: `${HANDLE_WIDTH}px`,
  cursor: "col-resize",
  background: "transparent",
};

export default function Home() {
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const dragging = useRef(false);

  const [sessions, setSessions] = useState<SessionWorkspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function loadSessions() {
      try {
        setLoading(true);
        const res = await fetch("/api/sessions", {
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new Error(`Request failed: ${res.status}`);
        }
        const body: ApiResponse<SessionWorkspace[]> = await res.json();
        setSessions(body.data);
        setError(null);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    }

    loadSessions();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const handleMove = (event: MouseEvent) => {
      if (!dragging.current) return;
      const next = Math.min(500, Math.max(220, event.clientX));
      setSidebarWidth(next);
    };

    const handleUp = () => {
      dragging.current = false;
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, []);

  const startDrag = (event: React.MouseEvent) => {
    event.preventDefault();
    dragging.current = true;
  };

  return (
    <main
      style={{ ...pageStyle, gridTemplateColumns: `${sidebarWidth}px ${HANDLE_WIDTH}px 1fr` }}
    >
      <aside style={sidebarStyle}>
        <div style={{ marginBottom: "1.25rem" }}>
          <p
            style={{
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              opacity: 0.72,
              fontSize: "0.75rem",
            }}
          >
            Sessions
          </p>
          <h1
            style={{
              margin: "0.15em 0 0.15em",
              fontSize: "1.35rem",
              fontWeight: 700,
              letterSpacing: "-0.01em",
            }}
          >
            Workspaces
          </h1>
          <p style={{ opacity: 0.7, margin: 0, fontSize: "0.95rem", lineHeight: 1.5 }}>
            Organisations, repos, active plans, and worktrees loaded from the API.
          </p>
        </div>

        {loading && <p style={{ opacity: 0.8 }}>Loading sessions…</p>}
        {error && (
          <p style={{ color: "#fca5a5" }}>Could not load sessions: {error}</p>
        )}

        {!loading && !error && sessions.length === 0 && (
          <p style={{ opacity: 0.8 }}>No workspaces yet.</p>
        )}

        {!loading &&
          !error &&
          sessions.map((workspace) => (
            <div
              key={workspace.name}
              style={{
                padding: "0.9rem 0.95rem",
                borderRadius: "0.75rem",
                border: "1px solid rgba(226, 232, 240, 0.12)",
                marginBottom: "0.85rem",
                background:
                  "linear-gradient(135deg, rgba(148, 163, 184, 0.08), rgba(148, 163, 184, 0.02))",
                boxShadow: "0 16px 40px rgba(0,0,0,0.18)",
              }}
            >
              <div
                style={{
                  fontWeight: 700,
                  marginBottom: "0.35rem",
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  fontSize: "0.9rem",
                  color: "#cbd5e1",
                }}
              >
                {workspace.name}
              </div>
              {workspace.repositories.map((repo) => (
                <div
                  key={repo.name}
                  style={{
                    marginLeft: "0.5rem",
                    marginBottom: "0.65rem",
                    borderLeft: "2px solid rgba(14, 165, 233, 0.4)",
                    paddingLeft: "0.65rem",
                  }}
                >
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: "1rem",
                      letterSpacing: "-0.01em",
                      color: "#e2e8f0",
                    }}
                  >
                    {repo.name}
                  </div>
                  {repo.plans.length > 0 && (
                    <div style={{ marginLeft: "0.75rem", marginTop: "0.1rem" }}>
                      <div style={{ opacity: 0.75, fontSize: "0.85rem", letterSpacing: "0.03em" }}>
                        Plans
                      </div>
                      <ul style={{ margin: "0.15rem 0 0.5rem", paddingLeft: "0.85rem" }}>
                        {repo.plans.map((plan) => (
                          <li
                            key={plan.session_id}
                            style={{
                              lineHeight: 1.5,
                              marginBottom: "0.15rem",
                              fontWeight: 600,
                              color: "#bae6fd",
                            }}
                          >
                            <span
                              style={{
                                background: "rgba(14, 165, 233, 0.15)",
                                padding: "0.15rem 0.5rem",
                                borderRadius: "999px",
                                fontSize: "0.9rem",
                              }}
                            >
                              {plan.name}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {repo.worktrees.length > 0 && (
                    <div style={{ marginLeft: "0.75rem", marginTop: "0.25rem" }}>
                      <div style={{ opacity: 0.75, fontSize: "0.85rem", letterSpacing: "0.03em" }}>
                        Worktrees
                      </div>
                      <ul
                        style={{
                          margin: "0.15rem 0 0",
                          paddingLeft: "0.85rem",
                          display: "grid",
                          gap: "0.25rem",
                        }}
                      >
                        {repo.worktrees.map((wt) => (
                          <li
                            key={wt.name}
                            style={{
                              lineHeight: 1.4,
                              fontWeight: 600,
                              color: "#cbd5e1",
                              background: "rgba(59, 130, 246, 0.12)",
                              border: "1px solid rgba(59, 130, 246, 0.35)",
                              borderRadius: "0.45rem",
                              padding: "0.35rem 0.5rem",
                              letterSpacing: "0.01em",
                            }}
                          >
                            {wt.name}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {repo.plans.length === 0 && repo.worktrees.length === 0 && (
                    <div
                      style={{
                        marginLeft: "0.75rem",
                        opacity: 0.68,
                        fontSize: "0.95rem",
                        fontStyle: "italic",
                      }}
                    >
                      No plans or worktrees yet.
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
      </aside>

      <div
        style={handleStyle}
        onMouseDown={startDrag}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
      />

      <section style={contentAreaStyle}>
        <div
          style={{
            border: "1px dashed rgba(226, 232, 240, 0.25)",
            borderRadius: "0.75rem",
            height: "100%",
            display: "grid",
            placeItems: "center",
            color: "#94a3b8",
          }}
        >
          <span>Workspace area</span>
        </div>
      </section>
    </main>
  );
}
