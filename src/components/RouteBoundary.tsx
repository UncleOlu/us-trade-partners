import { Component, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

export class RouteBoundary extends Component<{ children: ReactNode; hubUrl: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <section className="data-error" role="alert">
      <h1>This page could not open</h1>
      <p>A page file or its data could not be read. Reload to try again.</p>
      <div className="controls-row"><button onClick={() => window.location.reload()}>Reload page</button><Link to={this.props.hubUrl}>Browse the hub</Link></div>
    </section>;
    return this.props.children;
  }
}
