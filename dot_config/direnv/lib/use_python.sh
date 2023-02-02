use_python() {
    local version=${1:-}
    echo "using python ${version}"
    PATH_add $(rtx where python@${version})/bin
}
