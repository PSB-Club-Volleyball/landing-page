function AdminSignIn() {
  return (
    <div className="admin-lock-wrap">
      <div className="admin-lock-card">
        <h1>Sign in to manage content</h1>
        <p>
          Only approved Google or Microsoft accounts can edit the roster, board, events, or
          media.
        </p>
        <a className="oauth-btn" href="/api/auth/google/start">
          <span className="oauth-g">G</span> Continue with Google
        </a>
        <a className="oauth-btn" href="/api/auth/microsoft/start">
          <span className="oauth-m">M</span> Continue with Microsoft
        </a>
      </div>
    </div>
  )
}

export default AdminSignIn
