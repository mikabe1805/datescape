import { fireEvent, render, screen } from "@testing-library/react";
import MediaCarousel from "./MediaCarousel";

describe("MediaCarousel", () => {
  it("renders non-MP4 video URLs as video and exposes named navigation", () => {
    render(
      <MediaCarousel
        media={[
          "https://cdn.example/intro.webm?token=one",
          "https://cdn.example/photo.jpg",
        ]}
      />,
    );

    expect(screen.getByLabelText("Profile video 1")).toHaveAttribute(
      "src",
      "https://cdn.example/intro.webm?token=one",
    );
    fireEvent.click(screen.getByRole("button", { name: "Next media" }));
    expect(screen.getByAltText("Profile media 2")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Previous media" }),
    ).toBeInTheDocument();
  });
});
