import { Component, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  onClose: () => void;
};

type State = { message: string | null };

/** Must sit OUTSIDE the lazy viewer: its own hooks/import can fail before Canvas mounts. */
export default class PreviewBoundary extends Component<Props, State> {
  state: State = { message: null };

  static getDerivedStateFromError(error: unknown): State {
    return {
      message:
        error instanceof Error && error.message
          ? error.message.slice(0, 500)
          : "The 3D viewer could not be opened.",
    };
  }

  render() {
    if (this.state.message === null) return this.props.children;

    return (
      <div role="alert" className="flex h-full flex-col justify-center gap-3 overflow-auto p-4">
        <p className="font-medium">3D preview could not be opened.</p>
        <p className="ui-copy-sm">
          Your uploaded model and publication are unchanged. Close the preview
          to keep working. If it happens again, reload Studio to update the viewer.
        </p>
        <details className="ui-copy-sm break-words">
          <summary className="cursor-pointer">Preview error details</summary>
          <p className="mt-1">{this.state.message}</p>
        </details>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="ui-button ui-button-secondary ui-button-sm" onClick={this.props.onClose}>
            Close preview
          </button>
          <button type="button" className="ui-button ui-button-secondary ui-button-sm" onClick={() => this.setState({ message: null })}>
            Retry preview
          </button>
        </div>
      </div>
    );
  }
}
