import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import AuthForm from "./AuthForm.svelte";

async function fillAndSubmit(nickname: string, passcode: string) {
  await fireEvent.input(screen.getByTestId("nickname"), {
    target: { value: nickname },
  });
  await fireEvent.input(screen.getByTestId("passcode"), {
    target: { value: passcode },
  });
  await fireEvent.submit(screen.getByTestId("submit").closest("form")!);
}

describe("<AuthForm />", () => {
  it("starts in login mode by default", () => {
    render(AuthForm);
    expect(screen.getByTestId("mode-login")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("submit")).toHaveTextContent("Entrar");
  });

  it("switches to signup mode and updates the button label", async () => {
    render(AuthForm);
    await fireEvent.click(screen.getByTestId("mode-signup"));
    expect(screen.getByTestId("mode-signup")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("submit")).toHaveTextContent("Crear perfil");
  });

  it("emits mode-change when switching tabs", async () => {
    const { component } = render(AuthForm);
    const onChange = vi.fn();
    component.$on("mode-change", (e: CustomEvent) => onChange(e.detail));
    await fireEvent.click(screen.getByTestId("mode-signup"));
    expect(onChange).toHaveBeenCalledWith({ mode: "signup" });
  });

  it("submit is disabled until nickname (≥2) and 4-digit passcode are valid", async () => {
    render(AuthForm);
    const submit = screen.getByTestId("submit") as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    await fireEvent.input(screen.getByTestId("nickname"), { target: { value: "A" } });
    expect(submit.disabled).toBe(true);
    await fireEvent.input(screen.getByTestId("nickname"), { target: { value: "Ana" } });
    expect(submit.disabled).toBe(true);
    await fireEvent.input(screen.getByTestId("passcode"), { target: { value: "12" } });
    expect(submit.disabled).toBe(true);
    await fireEvent.input(screen.getByTestId("passcode"), { target: { value: "1234" } });
    expect(submit.disabled).toBe(false);
  });

  it("emits a submit event with trimmed nickname + passcode + mode", async () => {
    const { component } = render(AuthForm);
    const onSubmit = vi.fn();
    component.$on("submit", (e: CustomEvent) => onSubmit(e.detail));
    await fillAndSubmit("  Ana  ", "1234");
    expect(onSubmit).toHaveBeenCalledWith({
      nickname: "Ana",
      passcode: "1234",
      mode: "login",
    });
  });

  it("submit event reflects the active mode", async () => {
    const { component } = render(AuthForm);
    const onSubmit = vi.fn();
    component.$on("submit", (e: CustomEvent) => onSubmit(e.detail));
    await fireEvent.click(screen.getByTestId("mode-signup"));
    await fillAndSubmit("Bob", "5678");
    expect(onSubmit.mock.calls[0]![0].mode).toBe("signup");
  });

  it("submit button shows loading state when pending", () => {
    render(AuthForm, { props: { pending: true } });
    expect(screen.getByTestId("submit")).toHaveTextContent(/cargando/i);
    expect((screen.getByTestId("submit") as HTMLButtonElement).disabled).toBe(true);
  });

  it("renders an error banner when error is set", () => {
    render(AuthForm, { props: { error: "Nickname ya registrado" } });
    expect(screen.getByTestId("auth-error")).toHaveTextContent("Nickname ya registrado");
  });

  it("does not emit submit when validation fails", async () => {
    const { component } = render(AuthForm);
    const onSubmit = vi.fn();
    component.$on("submit", (e: CustomEvent) => onSubmit(e.detail));
    await fillAndSubmit("A", "12");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  // Regression coverage for a real bug report: signup showed the browser's
  // native pattern-mismatch tooltip ("usa el formato solicitado") instead
  // of anything the app controls. Root cause was autocomplete="current-password"
  // even in signup mode, which invites a password manager to autofill an
  // unrelated saved password that then fails the 4-digit pattern.
  it("uses new-password autocomplete in signup mode, current-password in login mode", async () => {
    render(AuthForm);
    expect(screen.getByTestId("passcode")).toHaveAttribute("autocomplete", "current-password");
    await fireEvent.click(screen.getByTestId("mode-signup"));
    expect(screen.getByTestId("passcode")).toHaveAttribute("autocomplete", "new-password");
  });

  it("strips non-digits and caps at 4 characters regardless of what's typed or pasted in", async () => {
    render(AuthForm);
    const input = screen.getByTestId("passcode") as HTMLInputElement;
    await fireEvent.input(input, { target: { value: "12a3456" } });
    expect(input.value).toBe("1234");
  });

  it("shows an in-app hint (not just relying on the native tooltip) once the field is touched and invalid", async () => {
    render(AuthForm);
    expect(screen.queryByTestId("passcode-hint")).not.toBeInTheDocument();
    await fireEvent.input(screen.getByTestId("passcode"), { target: { value: "12" } });
    await fireEvent.blur(screen.getByTestId("passcode"));
    expect(screen.getByTestId("passcode-hint")).toBeInTheDocument();
  });

  it("does not show the hint before the field has been touched, even if empty", () => {
    render(AuthForm);
    expect(screen.queryByTestId("passcode-hint")).not.toBeInTheDocument();
  });

  it("disables native browser validation (novalidate) so all feedback is in-app and controlled", () => {
    render(AuthForm);
    expect(screen.getByTestId("submit").closest("form")).toHaveAttribute("novalidate");
  });
});
