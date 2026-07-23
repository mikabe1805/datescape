import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import LandingPage from "./LandingPage";
import SignupStep1 from "./SignupStep1";
import SignupStep2 from "./SignupStep2";
import SignupStep5 from "./SignupStep5";
import SignupStepLocation from "./SignupStepLocation";

jest.mock("firebase/auth", () => ({
  fetchSignInMethodsForEmail: jest.fn(),
}));

jest.mock("../firebase", () => ({
  auth: { signOut: jest.fn() },
}));

const commonProps = {
  setFormData: jest.fn(),
  onNext: jest.fn(),
  onBack: jest.fn(),
  loading: false,
};

describe("signup validation accessibility", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("announces account errors and focuses the first missing field", () => {
    render(
      <MemoryRouter>
        <SignupStep1 {...commonProps} formData={{}} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByRole("alert")).toHaveTextContent(/fill in all fields/i);
    const email = screen.getByLabelText("Email");
    expect(email).toHaveFocus();
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(email).toHaveAttribute("aria-describedby", "signup-step1-error");
  });

  it("announces basics errors and focuses the first missing field", () => {
    render(<SignupStep2 {...commonProps} formData={{}} />);

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByRole("alert")).toHaveTextContent(/fill in every field/i);
    const displayName = screen.getByLabelText("Display name");
    expect(displayName).toHaveFocus();
    expect(displayName).toHaveAttribute("aria-invalid", "true");
    expect(displayName).toHaveAttribute(
      "aria-describedby",
      "signup-step2-error",
    );
  });

  it("keeps location validation actionable and focuses the city fallback", () => {
    render(<SignupStepLocation {...commonProps} formData={{ location: null }} />);

    const continueButton = screen.getByRole("button", { name: "Continue" });
    expect(continueButton).toBeEnabled();
    fireEvent.click(continueButton);

    expect(screen.getByRole("alert")).toHaveTextContent(/pick a location first/i);
    const city = screen.getByLabelText("Type a city or town");
    expect(city).toHaveFocus();
    expect(city).toHaveAttribute("aria-invalid", "true");
    expect(city).toHaveAttribute(
      "aria-describedby",
      "signup-location-error",
    );
  });
});

describe("signup media and landing actions", () => {
  it("accepts only an image in the cover slot and explains rejected video", () => {
    render(<SignupStep5 {...commonProps} formData={{ media: [] }} />);
    const coverInput = screen.getByLabelText("Choose cover photo");
    expect(coverInput).toHaveAttribute(
      "accept",
      "image/jpeg,image/png,image/webp",
    );

    fireEvent.change(coverInput, {
      target: {
        files: [new File(["video"], "intro.webm", { type: "video/webm" })],
      },
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      /cover must be a photo/i,
    );
    expect(commonProps.setFormData).not.toHaveBeenCalled();
  });

  it("rejects a legacy video URL in the first slot before continuing", () => {
    render(
      <SignupStep5
        {...commonProps}
        formData={{ media: ["https://cdn.example/intro.webm?token=one"] }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      /first slot must be a cover photo/i,
    );
    expect(commonProps.onNext).not.toHaveBeenCalled();
  });

  it("uses links as the landing CTAs without nested interactive controls", () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );

    const createAccount = screen.getByRole("link", {
      name: "Create your account",
    });
    expect(createAccount).toHaveAttribute("href", "/signup");
    expect(
      screen.queryByRole("button", { name: "Create your account" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(
      screen.getByRole("link", { name: "Preview Afterlight" }),
    ).toHaveAttribute("href", "/afterlight");
  });
});
