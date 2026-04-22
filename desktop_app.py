import sys
import os
import subprocess
import time
import requests
import signal
from PySide6.QtWidgets import QApplication, QMainWindow, QVBoxLayout, QWidget, QLabel
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtCore import QUrl, QTimer, Qt

# Configuration
NEXTJS_PORT = 3000
NEXTJS_URL = f"http://localhost:{NEXTJS_PORT}"
START_COMMAND = "npm run dev" # Change to "npm start" for production

class MainWindow(QMainWindow):
    def __init__(self, nextjs_process):
        super().__init__()
        self.nextjs_process = nextjs_process
        self.setWindowTitle("AI Storyboard Generator")
        self.resize(1200, 800)

        # Main widget and layout
        self.central_widget = QWidget()
        self.setCentralWidget(self.central_widget)
        self.layout = QVBoxLayout(self.central_widget)
        self.layout.setContentsMargins(0, 0, 0, 0)
        
        # Loading label
        self.loading_label = QLabel("Starting Next.js Server... Please wait.")
        self.loading_label.setAlignment(Qt.AlignCenter)
        self.layout.addWidget(self.loading_label)

        # Web view
        self.web_view = QWebEngineView()
        self.web_view.hide()
        self.layout.addWidget(self.web_view)

        # Timer to check if Next.js server is up
        self.check_timer = QTimer()
        self.check_timer.timeout.connect(self.check_server)
        self.check_timer.start(1000) # Check every second

    def check_server(self):
        try:
            response = requests.get(NEXTJS_URL, timeout=1)
            if response.status_code == 200:
                self.check_timer.stop()
                self.loading_label.hide()
                self.web_view.setUrl(QUrl(NEXTJS_URL))
                self.web_view.show()
        except requests.ConnectionError:
            pass # Server not up yet

    def closeEvent(self, event):
        """Handle application close to kill the Next.js background process cleanly."""
        if self.nextjs_process:
            print("Shutting down Next.js server...")
            # On Windows, terminating the shell doesn't terminate child processes.
            # We need to use taskkill to kill the entire process tree.
            if os.name == 'nt':
                subprocess.call(['taskkill', '/F', '/T', '/PID', str(self.nextjs_process.pid)])
            else:
                os.killpg(os.getpgid(self.nextjs_process.pid), signal.SIGTERM)
        event.accept()

def start_nextjs():
    """Starts the Next.js server in the background."""
    print(f"Starting Next.js with command: {START_COMMAND}")
    
    # creationflags for Windows to ensure the process tree can be killed
    creationflags = 0
    if os.name == 'nt':
        creationflags = subprocess.CREATE_NEW_PROCESS_GROUP

    # Using shell=True so npm is resolved in PATH
    process = subprocess.Popen(
        START_COMMAND,
        shell=True,
        cwd=os.path.dirname(os.path.abspath(__file__)),
        creationflags=creationflags
    )
    return process

if __name__ == "__main__":
    app = QApplication(sys.argv)
    
    # Start the backend server
    nextjs_process = start_nextjs()

    # Create and show main window
    window = MainWindow(nextjs_process)
    window.show()

    sys.exit(app.exec())
