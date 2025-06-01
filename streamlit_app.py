import streamlit as st

st.set_page_config(layout="wide")


def inject_slider_styles():

    st.markdown("""
    <style>
    /* Make background black */
    html, body, .main, .block-container {
        background-color: #0f1116 !important;
    }

    /* Constrain content width to simulate half-wide */
    .block-container {
        max-width: 600px;
        margin: 0 auto;
    }

    /* Make ALL text inside slider super tiny */
    div[data-baseweb="slider"] * {
        font-size: 1px !important;
        line-height: 1px !important;
        height: 5px !important;
        margin-bottom: -2px !important;
        padding-bottom: 0 !important;
        color: black !important;
        text-shadow: none !important;
    }

    /* Oval handle styling */
    div[data-baseweb="slider"] [role="slider"] {
        width: 10px !important;         /* wider */
        height: 30px !important;        /* shorter */
        background-color: #F6AD55 !important;
        border-radius: 50% / 100% !important;  /* forces oval shape */
        margin-top: 0px;              /* align vertically */
    }
                
    /* Custom label row */
    .slider-labels {
        display: flex;
        justify-content: space-between;
        padding: 0;
        font-size: 20px;
        font-weight: plain;
        color: white;
        margin-top: 0px;
        margin-bottom: 20px;
    }         
    </style>
                
    """, unsafe_allow_html=True)


inject_slider_styles()  # call once at top



# Slider builder with custom labels
def make_slider(label, min_val, max_val, default_val, left_label, right_label, key=None, label_size="14px"):
    if label:
        st.markdown(
            f"<div style='font-size:{label_size}; color:white; margin-bottom:4px;'>{label}</div>",
            unsafe_allow_html=True
        )
    value = st.slider("hidden", min_val, max_val, default_val, key=key, label_visibility="collapsed")
    st.markdown(f"""
    <div class="slider-labels">
        <span>{left_label}</span>
        <span>{right_label}</span>
    </div>
    """, unsafe_allow_html=True)
    return value


val1 = make_slider("Where were you today?", 0, 100, 0, "Holding Back", "Showing Up", key="s1", label_size="18px")
st.write("Value:", val1)