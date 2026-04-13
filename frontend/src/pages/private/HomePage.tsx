import { AuthService } from "src/services/authService";

function HomePage() {
  const authService = AuthService.getInstance();

  return (
    <div>
      <button onClick={() => authService.logout()}>Logout</button>
    </div>
  );
}

export default HomePage;
