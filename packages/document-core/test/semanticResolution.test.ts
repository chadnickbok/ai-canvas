import { describe, expect, it } from "vitest";

import {
  CANVAS_ROOT_ID,
  normalizeDocument,
  resolveCanvasSemanticSlot,
  resolveNodeSemanticSlot
} from "../src";

describe("semantic resolution and materialization", () => {
  it("resolves local, variable, and typography slots with exact-slot provenance", () => {
    const document = normalizeDocument({
      schema_version: 1,
      render_canon: "browser-css",
      document_id: "doc_semantic_precedence",
      name: "Semantic Precedence",
      canvas: {
        extent_mode: "infinite",
        authoring: {
          local_values: {},
          variable_bindings: {}
        }
      },
      root: {
        id: CANVAS_ROOT_ID,
        child_ids: ["text_1"]
      },
      nodes: {
        text_1: {
          kind: "text",
          name: "Title",
          parent_id: null,
          child_ids: [],
          render_style: {
            color: "#000000",
            fontSize: 12,
            boxShadow: "0 8px 30px rgba(0,0,0,0.18)"
          },
          authoring: {
            local_values: {
              "node.text.color": "#111111"
            },
            variable_bindings: {
              "node.typography.font_size": "body_type",
              "node.typography.font_weight": "body_type"
            },
            style_bindings: {
              text: "text_body"
            }
          },
          text: {
            content: "Hello"
          }
        }
      },
      variables: {
        collections: {
          tokens: {
            name: "Tokens",
            default_mode_id: "light",
            modes: {
              light: {
                name: "Light"
              },
              dark: {
                name: "Dark"
              }
            },
            variables: {
              body_type: {
                kind: "typography",
                name: "Body Type",
                scopes: ["node.typography.font_size", "node.typography.font_weight"],
                values_by_mode: {
                  light: {
                    kind: "value",
                    value: {
                      font_family: "Instrument Serif",
                      font_size: 16,
                      font_weight: 500
                    }
                  },
                  dark: {
                    kind: "value",
                    value: {
                      font_family: "Instrument Serif",
                      font_size: 18
                    }
                  }
                }
              }
            }
          }
        }
      },
      styles: {
        paint: {},
        text: {
          text_body: {
            name: "Body",
            slots: {
              "node.text.color": {
                kind: "value",
                value: "#333333"
              }
            }
          }
        }
      }
    });

    expect(resolveNodeSemanticSlot(document, "text_1", "node.text.color")).toEqual({
      slot: "node.text.color",
      value: "#111111",
      source_kind: "local"
    });

    expect(resolveNodeSemanticSlot(document, "text_1", "node.typography.font_size")).toEqual({
      slot: "node.typography.font_size",
      value: 16,
      source_kind: "variable",
      variable_id: "body_type",
      collection_id: "tokens",
      mode_id: "light"
    });

    expect(
      resolveNodeSemanticSlot(document, "text_1", "node.typography.font_size", {
        modeOverridesByCollectionId: {
          tokens: "dark"
        }
      })
    ).toEqual({
      slot: "node.typography.font_size",
      value: 18,
      source_kind: "variable",
      variable_id: "body_type",
      collection_id: "tokens",
      mode_id: "dark"
    });

    expect(
      resolveNodeSemanticSlot(document, "text_1", "node.typography.font_size", {
        modeOverridesByCollectionId: {
          tokens: "missing-mode"
        }
      })
    ).toEqual({
      slot: "node.typography.font_size",
      value: 16,
      source_kind: "variable",
      variable_id: "body_type",
      collection_id: "tokens",
      mode_id: "light"
    });

    expect(
      resolveNodeSemanticSlot(document, "text_1", "node.typography.font_weight", {
        modeOverridesByCollectionId: {
          tokens: "dark"
        }
      })
    ).toEqual({
      slot: "node.typography.font_weight",
      value: undefined,
      source_kind: "unresolved",
      variable_id: "body_type",
      collection_id: "tokens",
      mode_id: "dark"
    });

    expect(document.nodes.text_1.render_style).toEqual({
      color: "#111111",
      fontSize: 16,
      fontWeight: 500,
      boxShadow: "0 8px 30px rgba(0,0,0,0.18)"
    });
  });

  it("fails closed on inapplicable direct variables and does not fall back to styles", () => {
    const document = normalizeDocument({
      schema_version: 1,
      render_canon: "browser-css",
      document_id: "doc_semantic_unresolved",
      name: "Semantic Unresolved",
      root: {
        id: CANVAS_ROOT_ID,
        child_ids: ["text_1"]
      },
      nodes: {
        text_1: {
          kind: "text",
          name: "Caption",
          parent_id: null,
          child_ids: [],
          render_style: {
            color: "#999999",
            borderRadius: 12,
            boxShadow: "0 1px 2px rgba(0,0,0,0.2)"
          },
          authoring: {
            local_values: {},
            variable_bindings: {
              "node.text.color": "space_scale"
            },
            style_bindings: {
              text: "text_body"
            }
          },
          text: {
            content: "Hello"
          }
        }
      },
      variables: {
        collections: {
          tokens: {
            name: "Tokens",
            default_mode_id: "light",
            modes: {
              light: {
                name: "Light"
              }
            },
            variables: {
              space_scale: {
                kind: "spacing",
                name: "Scale 8",
                scopes: ["node.layout.gap"],
                values_by_mode: {
                  light: {
                    kind: "value",
                    value: 8
                  }
                }
              }
            }
          }
        }
      },
      styles: {
        paint: {},
        text: {
          text_body: {
            name: "Body",
            slots: {
              "node.text.color": {
                kind: "value",
                value: "#445566"
              }
            }
          }
        }
      }
    });

    expect(resolveNodeSemanticSlot(document, "text_1", "node.text.color")).toEqual({
      slot: "node.text.color",
      value: undefined,
      source_kind: "unresolved",
      variable_id: "space_scale",
      collection_id: "tokens",
      mode_id: "light"
    });

    expect(document.nodes.text_1.render_style).toEqual({
      boxShadow: "0 1px 2px rgba(0,0,0,0.2)"
    });
  });

  it("repairs broken semantic references, trims alias cycles, and materializes semantic-owned keys", () => {
    const document = normalizeDocument({
      schema_version: 1,
      render_canon: "browser-css",
      document_id: "doc_semantic_repair",
      name: "Semantic Repair",
      canvas: {
        extent_mode: "infinite",
        background_color: "#000000",
        authoring: {
          local_values: {
            "canvas.background_color": "#fafafa"
          },
          variable_bindings: {
            "canvas.background_color": "missing_canvas_token"
          }
        }
      },
      root: {
        id: CANVAS_ROOT_ID,
        child_ids: ["text_1"]
      },
      nodes: {
        text_1: {
          kind: "text",
          name: "Label",
          parent_id: null,
          child_ids: [],
          render_style: {
            color: "#000000",
            fontSize: 10,
            customFilter: "blur(6px)"
          },
          authoring: {
            local_values: {},
            variable_bindings: {
              "node.text.color": "missing_text_token"
            },
            style_bindings: {
              text: "text_body"
            }
          },
          text: {
            content: "Hello"
          }
        }
      },
      variables: {
        collections: {
          tokens: {
            name: "Tokens",
            default_mode_id: "light",
            modes: {
              light: {
                name: "Light"
              }
            },
            variables: {
              a: {
                kind: "color",
                name: "A",
                scopes: ["node.text.color"],
                values_by_mode: {
                  light: {
                    kind: "alias",
                    variable_id: "b"
                  }
                }
              },
              b: {
                kind: "color",
                name: "B",
                scopes: ["node.text.color"],
                values_by_mode: {
                  light: {
                    kind: "alias",
                    variable_id: "a"
                  }
                }
              }
            }
          }
        }
      },
      styles: {
        paint: {},
        text: {
          text_body: {
            name: "Body",
            slots: {
              "node.text.color": {
                kind: "variable",
                variable_id: "missing_text_token"
              },
              "node.typography.font_size": {
                kind: "value",
                value: 20
              }
            }
          }
        }
      }
    });

    expect(resolveCanvasSemanticSlot(document, "canvas.background_color")).toEqual({
      slot: "canvas.background_color",
      value: "#fafafa",
      source_kind: "local"
    });
    expect(document.canvas.authoring.variable_bindings).toEqual({});
    expect(document.canvas.background_color).toBe("#fafafa");

    expect(document.nodes.text_1.authoring.variable_bindings).toEqual({});
    expect(document.styles.text.text_body.slots).toEqual({
      "node.typography.font_size": {
        kind: "value",
        value: 20
      }
    });
    expect(document.variables.collections.tokens.variables.a.values_by_mode).toEqual({});
    expect(document.variables.collections.tokens.variables.b.values_by_mode).toEqual({
      light: {
        kind: "alias",
        variable_id: "a"
      }
    });
    expect(document.nodes.text_1.render_style).toEqual({
      fontSize: 20,
      customFilter: "blur(6px)"
    });
  });
});
