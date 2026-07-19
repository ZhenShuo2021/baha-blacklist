import logging
import os
import sys
from typing import ClassVar


def _enable_windows_ansi() -> None:
    """在舊版 Windows cmd.exe 上啟用 ANSI escape code 支援。

    Windows 10 build 16257 以後的終端機（含 Windows Terminal、PowerShell 7）
    原生支援 ANSI，這裡只是確保較舊的 cmd.exe 也能顯示顏色。
    """
    if os.name == "nt":
        os.system("")


class CustomFormatter(logging.Formatter):
    RESET = "\033[0m"
    GREEN = "\033[32m"

    COLORS: ClassVar[dict[int, str]] = {
        logging.DEBUG: "\033[90m",  # 亮黑（灰）
        logging.INFO: "\033[37m",  # 白
        logging.WARNING: "\033[33m",  # 黃
        logging.ERROR: "\033[31m",  # 紅
        logging.CRITICAL: "\033[31m\033[1m",  # 紅 + 粗體
    }

    def __init__(self, use_color: bool = True) -> None:
        super().__init__()
        self.use_color = use_color and sys.stdout.isatty()
        if self.use_color:
            _enable_windows_ansi()

    def format(self, record: logging.LogRecord) -> str:
        if self.use_color:
            color = self.COLORS.get(record.levelno, self.RESET)
            levelname = record.levelname.lower()
            return f"[{self.GREEN}{self.formatTime(record, '%H:%M:%S')}{self.RESET}][{color}{levelname}{self.RESET}] - {record.getMessage()}"
        else:
            # Convert levelname to lowercase for file logs
            levelname = record.levelname.lower()
            return f"[{self.formatTime(record, '%H:%M:%S')}][{levelname}] - {record.getMessage()}"


def setup_logging(
    level: int,
    log_path: str | None = None,
    logger_name: str | None = None,
    archive: bool = True,
) -> logging.Logger:
    """Configure logging with console and optional file handlers.

    Args:
        level (int): Logging level (e.g., logging.DEBUG).
        log_path (str): Path to the log file.
        archive (bool): If True, enables file logging.
    """
    logger = logging.getLogger(logger_name)

    # Clear existing handlers
    logging.root.handlers.clear()
    logger.handlers.clear()

    # Create formatters
    color_formatter = CustomFormatter(use_color=True)
    if archive:
        plain_formatter = CustomFormatter(use_color=False)

    # Console handler
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(color_formatter)
    logging.root.addHandler(console_handler)

    # File handler
    if archive and log_path:
        log_dir = os.path.dirname(log_path)
        if log_dir:
            os.makedirs(log_dir, exist_ok=True)
        file_handler = logging.FileHandler(log_path, encoding="utf-8")
        file_handler.setFormatter(plain_formatter)
        logging.root.addHandler(file_handler)

    # Set log level
    logging.root.setLevel(level)
    logger.setLevel(level)

    # suppress httpx INFO level log
    suppress_log(level)

    return logger


def suppress_log(level: int) -> None:
    level = logging.DEBUG if level == logging.DEBUG else logging.WARNING
    logging.getLogger("httpx").setLevel(level)
    logging.getLogger("httpcore").setLevel(level)
