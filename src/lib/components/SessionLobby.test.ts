import { render, screen } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import type { SessionsRecord } from "$core/records.js";
import SessionLobby from "./SessionLobby.svelte";

function makeSession(over: Partial<SessionsRecord> = {}): SessionsRecord {
  return {
    id: "ses_1234567890123",
    created: "",
    updated: "",
    collectionId: "pbc_sessions000",
    collectionName: "sessions",
    host: "p1",
    status: "active",
    qr_token: "tok-abc",
    ...over,
  };
}

describe("<SessionLobby />", () => {
  it("shows loading state", () => {
    render(SessionLobby, { props: { session: null, loading: true } });
    expect(screen.getByTestId("state")).toHaveTextContent(/cargando/i);
  });

  it("shows error state with message", () => {
    render(SessionLobby, {
      props: { session: null, loading: false, error: "Sesión no encontrada" },
    });
    expect(screen.getByTestId("state-error")).toHaveTextContent("Sesión no encontrada");
  });

  it("shows empty state when no session and no error", () => {
    render(SessionLobby, { props: { session: null } });
    expect(screen.getByTestId("state-empty")).toBeInTheDocument();
  });

  it("renders status label and join button when session is loaded", () => {
    render(SessionLobby, { props: { session: makeSession({ status: "active" }) } });
    expect(screen.getByTestId("status")).toHaveTextContent(/sesión en curso/i);
    expect(screen.getByTestId("join")).toBeInTheDocument();
  });

  it("uses singular copy for one participant", () => {
    render(SessionLobby, {
      props: { session: makeSession(), participantCount: 1 },
    });
    expect(screen.getByTestId("participant-count")).toHaveTextContent(/1 jugador\b/);
  });

  it("uses plural copy for more than one participant", () => {
    render(SessionLobby, {
      props: { session: makeSession(), participantCount: 4 },
    });
    expect(screen.getByTestId("participant-count")).toHaveTextContent(/4 jugadores/);
  });

  it("status label maps every enum value", () => {
    const cases: Array<[SessionsRecord["status"], RegExp]> = [
      ["created", /sala abierta/i],
      ["active", /sesión en curso/i],
      ["ended", /sesión terminada/i],
    ];
    for (const [status, expected] of cases) {
      const { unmount } = render(SessionLobby, {
        props: { session: makeSession({ status }) },
      });
      expect(screen.getByTestId("status")).toHaveTextContent(expected);
      unmount();
    }
  });
});
