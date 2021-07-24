if status is-interactive
    # set fisher_path $HOME/.config/fish/plugins

    # set fish_complete_path $fish_complete_path[1] $fisher_path/completions $fish_complete_path[2..-1]
    # set fish_function_path $fish_function_path[1] $fisher_path/functions $fish_function_path[2..-1]

    # for file in $fisher_path/conf.d/*.fish
    #     source $file
    # end

    # initialize brew environment variables
    if command -q brew
        brew shellenv | source
    end

    # add asdf executable and shims to path
    set PATH $HOME/.asdf/bin $HOME/.asdf/shims $PATH

    # initialize prompt
    starship init fish | source
end
