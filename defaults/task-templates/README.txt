Task templates

Each .json file contains one task type. CAN is an ordinary example you can edit,
duplicate or delete. Changes apply to new tasks. Existing project tasks keep their
own code and library assignments.

The easiest way to author a file is the Task types editor. You can also copy
can.espresso-task.json, change its top-level id and name, then edit its settings,
libraries, description, icon and base code. IDs must be unique across this folder.

The task object has ordered setup and loop placeholder steps. The code object
maps section keys to C++ text ending in a newline. Keys are the section kind,
a hyphen, then the UTF-8 ID in hexadecimal. Kinds include includes, helpers,
state, setupvars, loopvars and step. Edit these in ESPresso if preferred.

Icons can be short symbols or embedded PNG/JPEG/WebP data URLs up to 128 KB.
Libraries are ordinary local-source or GitHub-release definitions; only assigned
libraries are exported. A project's existing library with the same ID takes
precedence over a template's default library definition.

Click Refresh templates or reopen the task picker after adding or editing files.
Malformed files are reported individually; valid task types remain available.
Default files are installed once. Deleting one does not reinstall it.

Task config settings

The task.parameters array defines named values with name, label, description and
value strings. Values are C++ constant expressions. Template code refers to
parameters::name inside the task namespace. Every base task can define the same
settings. Constants are generated in Config::<task symbol> in the config file.
Each setting can also specify a C++ type (or auto). Task templates supply defaults.
Set task.periodExpression to an optional C++ period in milliseconds, or use the
numeric periodMs setting. The compiler resolves these names and expressions.
