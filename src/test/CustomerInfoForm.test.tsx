import { beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import CustomerInfoForm from "@/components/client/CustomerInfoForm";
vi.mock("@/lib/savedAddress", () => ({ getSavedAddress: () => null, setSavedAddress: vi.fn() }));
vi.mock("@/components/client/DeliveryAddressInput", () => ({ default: () => <div>Adresse</div> }));
beforeEach(() => { cleanup(); localStorage.clear(); });
it("accepts all empty contact fields in the optional menu flow", () => {
  const submit = vi.fn(); render(<CustomerInfoForm optionalContact onSubmit={submit} />);
  fireEvent.click(screen.getByRole("button", { name: "Confirmer" }));
  expect(submit).toHaveBeenCalledWith({ name: "", phone: "", email: "" });
});
it("can skip even previously filled contact information", () => {
  const submit = vi.fn(); render(<CustomerInfoForm optionalContact initialValues={{ name: "Test", phone: "0000000000" }} onSubmit={submit} />);
  fireEvent.click(screen.getByRole("button", { name: "Continuer sans coordonnées" }));
  expect(submit).toHaveBeenCalledWith({ name: "", phone: "", email: "" });
});
it("keeps name and phone mandatory in the ordinary flow", () => {
  const submit = vi.fn(); render(<CustomerInfoForm onSubmit={submit} />);
  fireEvent.click(screen.getByRole("button", { name: "Confirmer" }));
  expect(submit).not.toHaveBeenCalled(); expect(screen.getByText("Nom requis")).toBeInTheDocument(); expect(screen.getByText("Numéro invalide")).toBeInTheDocument();
});
it("keeps the delivery address mandatory outside the menu flow", () => {
  const submit = vi.fn(); render(<CustomerInfoForm showAddress initialValues={{ name: "Test", phone: "0000000000" }} onSubmit={submit} />);
  fireEvent.click(screen.getByRole("button", { name: "Confirmer" }));
  expect(submit).not.toHaveBeenCalled(); expect(screen.getByText("Adresse de livraison requise")).toBeInTheDocument();
});
it("validates an optional phone when one is entered", () => {
  const submit = vi.fn(); render(<CustomerInfoForm optionalContact initialValues={{ phone: "abc" }} onSubmit={submit} />);
  fireEvent.click(screen.getByRole("button", { name: "Confirmer" })); expect(submit).not.toHaveBeenCalled();
});
