"""仓库结构与卫生约束。

这组测试的意义是：任何一次提交如果破坏了「可以直接推到 GitHub」的前提
（缺文件、混进密钥、混进大文件），CI 会立刻失败。
"""
import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
MAX_FILE_BYTES = 1024 * 1024  # 1 MiB

SKIP_DIRS = {
    ".git",
    "node_modules",
    "__pycache__",
    ".venv",
    "venv",
    ".pytest_cache",
    ".ruff_cache",
    ".mypy_cache",
    "htmlcov",
    "dist",
    "build",
}

REQUIRED_PATHS = [
    "README.md",
    "LICENSE",
    ".gitignore",
    ".gitattributes",
    ".dockerignore",
    ".env.example",
    "requirements.txt",
    "package.json",
    "pyproject.toml",
    ".github/workflows/ci.yml",
    "src/server/app.py",
    "src/server/db.py",
    "src/server/data/history.json",
    "src/miniapp/app.json",
    "src/miniapp/utils/api.js",
    "tests",
    "docs",
]


def _walk_files():
    for path in REPO_ROOT.rglob("*"):
        if not path.is_file():
            continue
        parts = path.relative_to(REPO_ROOT).parts
        if any(part in SKIP_DIRS for part in parts):
            continue
        yield path


def test_recommended_structure_exists():
    missing = [p for p in REQUIRED_PATHS if not (REPO_ROOT / p).exists()]
    assert not missing, f"缺少必需的文件或目录：{missing}"


def test_env_template_exists_but_real_env_does_not():
    assert (REPO_ROOT / ".env.example").exists(), "应提供 .env.example 模板"
    assert not (REPO_ROOT / ".env").exists(), "真实 .env 绝不能进仓库"


def test_gitignore_covers_secrets_and_artifacts():
    text = (REPO_ROOT / ".gitignore").read_text(encoding="utf-8")
    required = [
        ".env",
        "__pycache__/",
        "venv/",
        ".venv/",
        "node_modules/",
        "dist/",
        "build/",
        "*.zip",
        "*.ttc",
        "*.ttf",
        "*.pem",
        "*.key",
        "project.private.config.json",
    ]
    missing = [p for p in required if p not in text]
    assert not missing, f".gitignore 未覆盖：{missing}"


def test_gitignore_does_not_swallow_source_directories():
    """未锚定的目录模式会误伤源码。

    真实踩过的坑：`.gitignore` 里写 `logs/` 会让 `src/miniapp/pages/logs/`
    整个页面被静默排除，所以必须写成锚定仓库根目录的 `/logs/`。
    """
    lines = {
        line.strip()
        for line in (REPO_ROOT / ".gitignore").read_text(encoding="utf-8").splitlines()
    }
    dangerous = {"logs/", "data/", "src/", "tests/", "docs/", "utils/", "pages/", "lib/"}
    offenders = sorted(lines & dangerous)
    assert not offenders, f"这些未锚定的忽略规则会误伤源码目录：{offenders}"


def test_no_oversized_files():
    """大文件 / 数据集 / 二进制必须走 Git LFS 或 Releases，不进仓库。"""
    offenders = [
        (p.relative_to(REPO_ROOT).as_posix(), p.stat().st_size)
        for p in _walk_files()
        if p.stat().st_size > MAX_FILE_BYTES
    ]
    assert not offenders, f"以下文件超过 1 MiB，应改用 Git LFS 或 Releases：{offenders}"


def test_no_font_or_archive_binaries_committed():
    banned_suffixes = {".ttc", ".ttf", ".otf", ".zip", ".rar", ".7z", ".p12", ".pfx", ".pem", ".key"}
    offenders = [
        p.relative_to(REPO_ROOT).as_posix()
        for p in _walk_files()
        if p.suffix.lower() in banned_suffixes
    ]
    assert not offenders, f"以下二进制/归档文件不应入库：{offenders}"


def test_mysql_password_has_no_hardcoded_default():
    """db.py 里密码只能来自环境变量，默认值必须为空串。"""
    text = (REPO_ROOT / "src" / "server" / "db.py").read_text(encoding="utf-8")
    assert "os.environ.get('MYSQL_PASSWORD', '')" in text


SECRET_ASSIGNMENT = re.compile(
    r"""(?ix)
    \b(password|passwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key)\b
    \s*[:=]\s*
    (['"])          # 开引号
    (?!\s*\2)       # 后面不是紧接闭合引号 —— 即赋了非空字符串
    [^'"]{6,}
    \2              # 闭合引号
    """
)


def test_no_literal_secrets_in_source():
    """扫描 src/ 下的源码，禁止出现 password/token/secret = "非空字面量"。"""
    offenders = []
    for path in _walk_files():
        if path.suffix.lower() not in {".py", ".js", ".json", ".yml", ".yaml", ".mjs"}:
            continue
        if "src" not in path.relative_to(REPO_ROOT).parts:
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        if SECRET_ASSIGNMENT.search(text):
            offenders.append(path.relative_to(REPO_ROOT).as_posix())
    assert not offenders, f"以下文件疑似写死了密钥/口令：{offenders}"


def test_ci_workflow_is_well_formed():
    """ci.yml 至少要有 on / jobs 两个顶层键，且不能要求写权限。"""
    text = (REPO_ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
    assert text.startswith("name:")
    assert "\non:" in text
    assert "\njobs:" in text
    assert "contents: read" in text
